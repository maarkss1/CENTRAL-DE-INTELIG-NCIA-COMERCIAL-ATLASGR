#!/usr/bin/env python3
"""ETL SENATRAN (frota de veiculos por municipio e tipo) -> senatran_frota_municipios.json.

Fonte oficial: Ministerio dos Transportes / SENATRAN, planilha "Frota de
veiculos, por tipo e com placa, segundo os Municipios da Federacao"
(https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/
frota-de-veiculos-<ano>). Publicada mensalmente em .xlsx, com granularidade
municipal real (nao PROXY_UF) e coluna por tipo de veiculo -- ao contrario do
recurso RNTRC-Dados de Veiculos da ANTT (granularidade UF, sem municipio, ver
FONTES.md secao 2), que permanece bloqueado.

Descoberta dinamica: o nome do arquivo nao segue um padrao estavel de
separador/capitalizacao entre meses (ex.: `Frota_por_municipio_e_tipo_
Julho_2026.xlsx` vs `frotapormunicipioetipofevereiro2026.xlsx`), entao o
mes/ano vigente e resolvido varrendo os links reais da pagina, nunca
construindo a URL a partir de um padrao fixo.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from etl_rntrc_atlas import extract_uf, norm  # reutiliza normalizacao e resolucao de UF ja validadas

USER_AGENT = "AtlasGR-MarketIntelligence/1.0 (+data engineering)"
IBGE_MUNICIPIOS = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
SENATRAN_YEAR_PAGE = "https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/frota-de-veiculos-{year}"
SENATRAN_STATS_PAGE = "https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/estatisticas-frota-de-veiculos-senatran"

VALID_UFS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
    "SP", "SE", "TO",
}


# Chaves ja normalizadas (norm() troca "-" por espaco), pois `by_type` e indexado
# pelo cabecalho normalizado -- "SEMI-REBOQUE" vira "SEMI REBOQUE" apos norm().
CARGO_TYPES = ("CAMINHAO", "CAMINHAO TRATOR", "REBOQUE", "SEMI REBOQUE")

MONTHS = {
    "JANEIRO": 1, "FEVEREIRO": 2, "MARCO": 3, "ABRIL": 4, "MAIO": 5, "JUNHO": 6,
    "JULHO": 7, "AGOSTO": 8, "SETEMBRO": 9, "OUTUBRO": 10, "NOVEMBRO": 11, "DEZEMBRO": 12,
}

RESOURCE_NAME_RE = re.compile(r"frota.{0,3}por.{0,3}municipio.{0,3}e.{0,3}tipo", re.IGNORECASE)


@dataclass(frozen=True)
class ResourceMeta:
    url: str
    competence: str


def request_bytes(url: str, timeout: int = 180, referer: str | None = None) -> bytes:
    headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if referer:
        headers["Referer"] = referer
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        return response.read()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_month_year(text: str) -> tuple[int, int] | None:
    # Sem \b antes do mes: nomes de arquivo reais colam palavras sem separador
    # (ex.: "...etipofevereiro2026.xlsx"), entao nao ha fronteira de palavra
    # entre "tipo" e "fevereiro". O ano com \b apos garante que nao casamos um
    # prefixo de um numero maior por engano.
    normalized = norm(text)
    match = re.search(
        r"(" + "|".join(MONTHS) + r")\D{0,3}(20\d{2})\b",
        normalized,
    )
    if not match:
        return None
    return int(match.group(2)), MONTHS[match.group(1)]


def discover_latest_resource(years: tuple[int, ...]) -> ResourceMeta:
    candidates: list[tuple[int, int, str]] = []
    for year in years:
        url = SENATRAN_YEAR_PAGE.format(year=year)
        try:
            html = request_bytes(url).decode("utf-8", errors="replace")
        except OSError:
            continue
        for href_match in re.finditer(r'href="([^"]+\.xlsx)"', html, re.IGNORECASE):
            href = href_match.group(1)
            if not RESOURCE_NAME_RE.search(href):
                continue
            parsed = parse_month_year(href)
            if not parsed:
                continue
            resource_url = href if href.startswith("http") else f"https://www.gov.br{href}"
            candidates.append((parsed[0], parsed[1], resource_url))
    if not candidates:
        raise RuntimeError(
            f"Nenhum recurso 'Frota por municipio e tipo' encontrado nas paginas SENATRAN dos anos {years!r}"
        )
    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    year, month, url = candidates[0]
    return ResourceMeta(url=url, competence=f"{year:04d}-{month:02d}")


def download_with_retry(url: str, target: Path, referer: str, attempts: int = 4, timeout: int = 300) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        if target.exists() and target.stat().st_size >= 1000:
            return
        try:
            payload = request_bytes(url, timeout=timeout, referer=referer)
            if len(payload) < 1000:
                raise RuntimeError(f"Download retornou apenas {len(payload)} bytes")
            target.write_bytes(payload)
        except OSError as error:
            last_error = error
            target.unlink(missing_ok=True)
            if attempt < attempts:
                time.sleep(2**attempt)
    if not target.exists() or target.stat().st_size < 1000:
        raise RuntimeError(f"Falha ao baixar {url} apos {attempts} tentativas: {last_error}")


def read_xlsx_sheet(path: Path, sheet_member: str = "xl/worksheets/sheet1.xml") -> list[list[str | None]]:
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as archive:
        strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            sst_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for si in sst_root.findall("m:si", ns):
                text = "".join(t.text or "" for t in si.iter(f"{{{ns['m']}}}t"))
                strings.append(text)
        sheet_root = ET.fromstring(archive.read(sheet_member))

    def cell_value(cell: ET.Element) -> str | None:
        value = cell.find("m:v", ns)
        if value is None:
            return None
        return strings[int(value.text)] if cell.get("t") == "s" else value.text

    rows: list[list[str | None]] = []
    for row in sheet_root.find("m:sheetData", ns).findall("m:row", ns):
        rows.append([cell_value(cell) for cell in row.findall("m:c", ns)])
    return rows


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def load_ibge_by_name(cache: Path) -> dict[tuple[str, str], dict[str, Any]]:
    cache.parent.mkdir(parents=True, exist_ok=True)
    if not cache.exists():
        import gzip

        request = urllib.request.Request(IBGE_MUNICIPIOS, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=180) as response:  # noqa: S310
            payload = response.read()
            if response.headers.get("Content-Encoding", "").lower() == "gzip" or payload[:2] == b"\x1f\x8b":
                payload = gzip.decompress(payload)
        cache.write_bytes(payload)

    rows = json.loads(cache.read_text(encoding="utf-8"))
    lookup: dict[tuple[str, str], dict[str, Any]] = {}
    for raw_row in rows:
        if not isinstance(raw_row, dict):
            continue
        uf = extract_uf(raw_row)
        sigla = str(uf.get("sigla") or "").upper()
        if not sigla:
            continue
        lookup[(sigla, norm(raw_row.get("nome")))] = {
            "ibgeCode": str(raw_row.get("id")),
            "name": raw_row.get("nome"),
            "uf": sigla,
            "region": as_dict(uf.get("regiao")).get("nome"),
        }
    if len(lookup) < 5500:
        raise RuntimeError(f"Cadastro municipal IBGE incompleto: apenas {len(lookup)} municipios com UF")
    return lookup


def find_header_row(rows: list[list[str | None]]) -> tuple[int, dict[str, int]]:
    for i, row in enumerate(rows):
        cells = [norm(c) for c in row]
        if cells[:2] == ["UF", "MUNICIPIO"]:
            return i, {name: idx for idx, name in enumerate(cells) if name}
    raise RuntimeError("Cabecalho 'UF / MUNICIPIO' nao encontrado na planilha SENATRAN")


def parse_quantity(value: str | None) -> int:
    if not value:
        return 0
    try:
        return int(round(float(value)))
    except ValueError:
        return 0


def aggregate(rows: list[list[str | None]], ibge: dict[tuple[str, str], dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    header_idx, columns = find_header_row(rows)
    type_columns = [name for name in columns if name not in {"UF", "MUNICIPIO", "TOTAL"}]

    output: list[dict[str, Any]] = []
    unmatched: dict[str, int] = defaultdict(int)
    processed = 0
    for row in rows[header_idx + 1 :]:
        if not row or not row[0] or norm(row[0]) not in VALID_UFS:
            continue
        processed += 1
        uf = norm(row[0])
        municipality = row[1] or ""
        geo = ibge.get((uf, norm(municipality)))
        if not geo:
            unmatched[f"{municipality}/{uf}"] += 1
            continue

        def cell(name: str) -> str | None:
            idx = columns.get(name)
            return row[idx] if idx is not None and idx < len(row) else None

        by_type = {name: parse_quantity(cell(name)) for name in type_columns}
        total = parse_quantity(cell("TOTAL"))
        cargo_fleet = sum(by_type.get(t, 0) for t in CARGO_TYPES)
        output.append({
            "ibgeCode": geo["ibgeCode"],
            "name": geo["name"],
            "uf": geo["uf"],
            "region": geo["region"],
            "total": total,
            "cargoFleet": cargo_fleet,
            "byType": by_type,
        })
    output.sort(key=lambda row: (row["uf"], row["name"]))
    stats = {
        "rows_processed": processed,
        "municipalities_matched": len(output),
        "rows_unmatched_geography": sum(unmatched.values()),
        "distinct_unmatched_geography": len(unmatched),
    }
    return output, stats


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", type=Path, default=Path(".cache/market-intelligence/senatran"))
    parser.add_argument("--output", type=Path, default=Path("public/tools/atlas-market-intelligence/data/senatran_frota_municipios.json"))
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--resource-url")
    parser.add_argument("--competence")
    parser.add_argument("--ibge-json", type=Path)
    args = parser.parse_args()
    args.workdir.mkdir(parents=True, exist_ok=True)

    if args.resource_url:
        if not args.competence:
            raise SystemExit("--competence e obrigatorio quando --resource-url e informado manualmente")
        resource = ResourceMeta(url=args.resource_url, competence=args.competence)
    else:
        current_year = datetime.now(timezone.utc).year
        resource = discover_latest_resource((current_year, current_year - 1))

    raw_dir = args.workdir / "raw" / resource.competence
    source = raw_dir / Path(resource.url).name
    referer = SENATRAN_YEAR_PAGE.format(year=int(resource.competence.split("-")[0]))
    download_with_retry(resource.url, source, referer=referer)

    ibge_cache = args.ibge_json or (args.workdir / "raw" / "ibge" / "municipios.json")
    ibge = load_ibge_by_name(ibge_cache)
    xlsx_rows = read_xlsx_sheet(source)
    rows, stats = aggregate(xlsx_rows, ibge)
    if not rows:
        raise RuntimeError("SENATRAN derivado vazio")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    metadata_path = args.metadata or args.output.with_suffix(".metadata.json")
    metadata = {
        "dataset": "SENATRAN - Frota de veiculos por municipio e tipo",
        "resource": asdict(resource),
        "sourcePage": SENATRAN_STATS_PAGE,
        "downloadedAt": datetime.now(timezone.utc).isoformat(),
        "rawSha256": sha256_file(source),
        "rawBytes": source.stat().st_size,
        "output": str(args.output),
        "outputSha256": sha256_file(args.output),
        "stats": stats,
        "cargoTypes": list(CARGO_TYPES),
        "transformations": [
            "download do .xlsx oficial SENATRAN (planilha 'Frota por municipio e tipo') do mes/ano vigente",
            "parser stdlib do formato OOXML (zipfile + sharedStrings + worksheet XML), sem dependencia externa",
            "normalizacao textual apenas para lookup contra cadastro IBGE",
            "join municipio+UF contra cadastro IBGE",
            "agregacao por tipo de veiculo; cargoFleet soma CAMINHAO + CAMINHAO TRATOR + REBOQUE + SEMI-REBOQUE",
        ],
        "limitations": [
            "join por nome de municipio (a planilha SENATRAN nao publica codigo IBGE); municipios homonimos sao desambiguados por UF, nao apenas por nome",
            "cargoFleet e uma soma de categorias de veiculo, nao um indicador oficial SENATRAN; cada tipo permanece disponivel individualmente em byType",
        ],
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    if stats["rows_unmatched_geography"]:
        print(
            "AVISO: existem linhas SENATRAN sem correspondencia IBGE; revisar antes de promover o dataset como completo.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
