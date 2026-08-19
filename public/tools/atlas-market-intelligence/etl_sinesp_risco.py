#!/usr/bin/env python3
"""ETL MJSP/Sinesp VDE (Validador de Dados Estatísticos) -> risco municipal.

Fonte oficial: `bancovde-<ano>.xlsx`, publicado em
`gov.br/mj/.../estatistica/download/dnsp-base-de-dados/` -- base nacional de
ocorrências criminais por município e mês, granularidade municipal real (não
UF), atualizada correntemente (ver `discover_latest_bancovde`).

Este script é uma reescrita completa do `etl_risco_sinesp.py` legado: aquele
exigia `openpyxl` (dependência externa, fora do padrão stdlib-only deste
projeto), entrada manual e produzia CSV sem código IBGE. O arquivo `bancovde`
tem outro layout (colunas `uf`/`municipio`/`evento`/`data_referencia`/`total`)
e é grande o suficiente (~485 mil linhas, ~250 MB de XML descomprimido) para
exigir parsing em streaming (`iterparse`) em vez de DOM completo -- o script
legado não foi adaptado porque a reescrita era mais simples que fazer as duas
abordagens conviverem. `etl_risco_sinesp.py` permanece no repositório para
processamento manual de arquivos ZIP/XLSX antigos com o layout ambíguo
longo/largo que ele já sabia reconhecer.

Uso automático (descoberta do ano vigente):
  python etl_sinesp_risco.py --output-dir public/tools/atlas-market-intelligence/data

Uso manual (arquivo já baixado):
  python etl_sinesp_risco.py --input bancovde-2026.xlsx --competence-year 2026
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import time
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

IBGE_MUNICIPIOS = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
BANCOVDE_BASE = "https://www.gov.br/mj/pt-br/assuntos/sua-seguranca/seguranca-publica/estatistica/download/dnsp-base-de-dados"
BANCOVDE_REFERER = "https://www.gov.br/mj/pt-br/assuntos/sua-seguranca/seguranca-publica/estatistica/dados-nacionais-1/base-de-dados-e-notas-metodologicas-dos-gestores-estaduais-sinesp-vde-2022-e-2023"
USER_AGENT = "AtlasGR-MarketIntelligence/1.0 (+data engineering)"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
EXCEL_EPOCH = date(1899, 12, 30)

# Chaves exatas observadas no bancovde real (coluna "evento"); normalizadas via norm().
EVENT_TARGETS = {
    "ROUBO DE CARGA": "cargoRobbery",
    "ROUBO DE VEICULO": "vehicleRobbery",
    "FURTO DE VEICULO": "vehicleTheft",
}

NOT_INFORMED = "NAO INFORMADO"


@dataclass(frozen=True)
class ResourceMeta:
    url: str
    year: int


def norm(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(char for char in text if not unicodedata.combining(char)).upper().strip()
    return re.sub(r"[^A-Z0-9]+", " ", text).strip()


def request_bytes(url: str, timeout: int = 180, referer: str | None = None) -> bytes:
    headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if referer:
        headers["Referer"] = referer
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        payload = response.read()
        if response.headers.get("Content-Encoding", "").lower() == "gzip" or payload[:2] == b"\x1f\x8b":
            payload = gzip.decompress(payload)
        return payload


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_with_retry(url: str, target: Path, referer: str, attempts: int = 4, timeout: int = 300) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        if target.exists() and target.stat().st_size >= 100_000:
            return
        try:
            payload = request_bytes(url, timeout=timeout, referer=referer)
            if len(payload) < 100_000:
                raise RuntimeError(f"Download retornou apenas {len(payload)} bytes")
            target.write_bytes(payload)
        except OSError as error:
            last_error = error
            target.unlink(missing_ok=True)
            if attempt < attempts:
                time.sleep(2**attempt)
    if not target.exists() or target.stat().st_size < 100_000:
        raise RuntimeError(f"Falha ao baixar {url} apos {attempts} tentativas: {last_error}")


def discover_latest_bancovde(candidate_years: tuple[int, ...]) -> ResourceMeta:
    """Confirma qual `bancovde-<ano>.xlsx` mais recente existe de fato (probe HEAD-like via GET curto)."""
    for year in candidate_years:
        url = f"{BANCOVDE_BASE}/bancovde-{year}.xlsx/@@download/file"
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Referer": BANCOVDE_REFERER, "Range": "bytes=0-1023"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310
                if response.status not in (200, 206):
                    continue
                response.read()
        except OSError:
            continue
        return ResourceMeta(url=url, year=year)
    raise RuntimeError(f"Nenhum bancovde encontrado para os anos candidatos {candidate_years!r}")


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def extract_uf(row: dict[str, Any]) -> dict[str, Any]:
    micro = as_dict(row.get("microrregiao"))
    meso = as_dict(micro.get("mesorregiao"))
    uf = as_dict(meso.get("UF"))
    if uf:
        return uf
    immediate = as_dict(row.get("regiao-imediata"))
    intermediate = as_dict(immediate.get("regiao-intermediaria"))
    return as_dict(intermediate.get("UF"))


def load_uf_regions(cache: Path) -> dict[str, str]:
    cache.parent.mkdir(parents=True, exist_ok=True)
    if not cache.exists():
        cache.write_bytes(request_bytes(IBGE_MUNICIPIOS))
    rows = json.loads(cache.read_text(encoding="utf-8"))
    lookup: dict[str, str] = {}
    for raw_row in rows:
        if not isinstance(raw_row, dict):
            continue
        uf = extract_uf(raw_row)
        sigla = str(uf.get("sigla") or "").upper()
        if sigla:
            lookup[sigla] = as_dict(uf.get("regiao")).get("nome")
    if len(lookup) < 26:
        raise RuntimeError(f"Cadastro de UF do IBGE incompleto: apenas {len(lookup)} UFs resolvidas")
    return lookup


def col_letter(cell_ref: str) -> str:
    return "".join(char for char in cell_ref if char.isalpha())


def parse_int(value: str | None) -> int:
    if not value:
        return 0
    try:
        return int(round(float(value)))
    except ValueError:
        return 0


def excel_serial_to_month(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = EXCEL_EPOCH + timedelta(days=int(round(float(value))))
    except ValueError:
        return None
    return f"{parsed.year:04d}-{parsed.month:02d}"


def stream_rows(path: Path):
    """Le xl/worksheets/sheet1.xml em streaming (iterparse), sem materializar o DOM inteiro.

    O arquivo real tem ~485 mil linhas / ~250 MB de XML descomprimido -- carregar via
    ET.fromstring(archive.read(...)) (padrao usado no SENATRAN, ~5 mil linhas) nao escala aqui.
    """
    with zipfile.ZipFile(path) as archive:
        with archive.open("xl/worksheets/sheet1.xml") as handle:
            header: dict[str, str] = {}
            for _, elem in ET.iterparse(handle, events=("end",)):
                if elem.tag != f"{NS}row":
                    continue
                cells: dict[str, str | None] = {}
                for cell in elem.findall(f"{NS}c"):
                    col = col_letter(cell.get("r", ""))
                    inline = cell.find(f"{NS}is/{NS}t")
                    value = cell.find(f"{NS}v")
                    cells[col] = inline.text if inline is not None else (value.text if value is not None else None)
                if not header:
                    header = {col: (name or "").strip().lower() for col, name in cells.items()}
                else:
                    yield {header.get(col, col): val for col, val in cells.items()}
                elem.clear()


def aggregate(path: Path, uf_region: dict[str, str]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Agrega por UF, nao por municipio.

    Achado real ao processar o bancovde: para os 3 eventos alvo (Roubo de carga,
    Roubo de veiculo, Furto de veiculo), TODA linha tem municipio="NAO INFORMADO"
    -- essa granularidade simplesmente nao existe na fonte para esses indicadores
    (crimes contra a pessoa, como feminicidio/homicidio, tem municipio real; os
    3 indicadores de risco de carga/veiculo, nao). Publicar como PROXY_UF em vez
    de inventar/estimar uma distribuicao municipal que a fonte nao fornece.
    """
    totals: dict[str, dict[str, int]] = defaultdict(lambda: {key: 0 for key in EVENT_TARGETS.values()})
    months_by_uf: dict[str, set[str]] = defaultdict(set)
    months_observed: set[str] = set()
    unmatched_uf: dict[str, int] = defaultdict(int)
    processed = relevant = with_municipal_detail = 0

    for row in stream_rows(path):
        processed += 1
        evento = norm(row.get("evento"))
        target_key = EVENT_TARGETS.get(evento)
        if not target_key:
            continue
        relevant += 1
        month = excel_serial_to_month(row.get("data_referencia"))
        if month:
            months_observed.add(month)
        uf = (row.get("uf") or "").strip().upper()
        municipio_norm = norm(row.get("municipio"))
        if municipio_norm and municipio_norm != NOT_INFORMED:
            with_municipal_detail += 1
        if not uf or uf not in uf_region:
            unmatched_uf[uf or "(vazio)"] += 1
            continue
        totals[uf][target_key] += parse_int(row.get("total"))
        if month:
            months_by_uf[uf].add(month)

    output = [{
        "uf": uf, "region": uf_region[uf],
        "cargoRobbery": counts["cargoRobbery"], "vehicleRobbery": counts["vehicleRobbery"],
        "vehicleTheft": counts["vehicleTheft"], "monthsObserved": len(months_by_uf.get(uf, ())),
        "geography": "PROXY_UF",
    } for uf, counts in totals.items()]
    output.sort(key=lambda row: row["uf"])

    return output, {
        "rows_processed": processed,
        "relevant_event_rows": relevant,
        "relevant_rows_with_municipal_detail": with_municipal_detail,
        "ufs_matched": len(output),
        "rows_unmatched_uf": sum(unmatched_uf.values()),
        "months_observed_total": len(months_observed),
        "window_start": min(months_observed) if months_observed else None,
        "window_end": max(months_observed) if months_observed else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", type=Path, default=Path(".cache/market-intelligence/sinesp"))
    parser.add_argument("--output", type=Path, default=Path("public/tools/atlas-market-intelligence/data/risco_uf.json"))
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--input", type=Path, help="bancovde-<ano>.xlsx ja baixado; omitido: descobre e baixa o ano vigente")
    parser.add_argument("--competence-year", type=int, help="Obrigatorio com --input manual")
    parser.add_argument("--ibge-json", type=Path)
    args = parser.parse_args()
    args.workdir.mkdir(parents=True, exist_ok=True)

    if args.input is None:
        current_year = datetime.now(timezone.utc).year
        resource = discover_latest_bancovde((current_year, current_year - 1))
        source = args.workdir / "raw" / str(resource.year) / f"bancovde-{resource.year}.xlsx"
        download_with_retry(resource.url, source, referer=BANCOVDE_REFERER)
        competence_year = resource.year
        source_url = resource.url
    else:
        if not args.competence_year:
            raise SystemExit("--competence-year e obrigatorio quando --input e informado manualmente")
        source = args.input
        competence_year = args.competence_year
        source_url = f"{BANCOVDE_BASE}/bancovde-{competence_year}.xlsx/@@download/file"

    if not source.exists() or source.stat().st_size < 100_000:
        raise SystemExit(f"Entrada Sinesp VDE invalida: {source}")

    ibge_cache = args.ibge_json or (args.workdir / "raw" / "ibge" / "municipios.json")
    uf_region = load_uf_regions(ibge_cache)
    rows, stats = aggregate(source, uf_region)
    if not rows:
        raise RuntimeError("Sinesp VDE derivado vazio")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    metadata_path = args.metadata or args.output.with_suffix(".metadata.json")
    competence = f"{stats['window_start']} a {stats['window_end']}" if stats["window_start"] else f"{competence_year}"
    metadata = {
        "dataset": "MJSP/Sinesp VDE - roubo de carga, roubo de veiculo, furto de veiculo (granularidade UF)",
        "resource": asdict(ResourceMeta(url=source_url, year=competence_year)),
        "downloadedAt": datetime.now(timezone.utc).isoformat(),
        "rawSha256": sha256_file(source),
        "rawBytes": source.stat().st_size,
        "output": str(args.output),
        "outputSha256": sha256_file(args.output),
        "competence": competence,
        "stats": stats,
        "geography": "PROXY_UF",
        "transformations": [
            "download do bancovde-<ano>.xlsx oficial (ano vigente descoberto automaticamente)",
            "parser stdlib em streaming (zipfile + xml.etree.ElementTree.iterparse) -- arquivo grande demais (~485 mil linhas) para DOM completo",
            "filtro pelos eventos Roubo de carga / Roubo de veiculo / Furto de veiculo",
            "soma do campo 'total' por UF/evento em todos os meses presentes no arquivo do ano vigente",
        ],
        "limitations": [
            f"achado real da fonte, nao limitacao do parser: para estes 3 indicadores, 100% das "
            f"{stats['relevant_event_rows']} linhas relevantes tem municipio='NAO INFORMADO' "
            f"({stats['relevant_rows_with_municipal_detail']} com municipio real) -- ao contrario de "
            "indicadores de crime contra a pessoa (feminicidio, homicidio) que TEM municipio real no "
            "mesmo arquivo. Publicado como PROXY_UF, nunca com municipio inventado;",
            "janela observada e apenas o(s) mes(es) presentes no arquivo do ano vigente (bancovde e publicado por ano civil); nao cruza automaticamente para o arquivo do ano anterior para completar 12 meses",
            "duas linhas por UF/evento/mes podem existir (abrangencia Estadual vs Policia Federal/Rodoviaria Federal); ambas sao somadas, tratando ausencia (null) como 0",
            "'total' e a contagem bruta de ocorrencias reportada pela fonte, sem normalizacao por populacao",
        ],
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
