#!/usr/bin/env python3
"""ETL de exportações oficiais ANTT / Movimentação de Cargas (MDF-e / CIOT).

A ANTT não publica exportação aberta de MDF-e (o painel público é um dashboard
interativo, sem CSV/JSON reproduzível -- ver `FONTES.md` seção 3). O CIOT
(Código Identificador da Operação de Transporte), por outro lado, é publicado
mensalmente em `dados.antt.gov.br` com origem/destino municipal e grupo NCM
por operação de transporte rodoviário contratada -- a melhor fonte oficial
reproduzível de fluxo de carga origem-destino disponível hoje. Este ETL usa o
CIOT como PROXY documentado de fluxo logístico, nunca apresentado como MDF-e
literal: `sourceKind` no metadata e `municipalUse` no manifest deixam essa
distinção explícita em todo lugar que o dataset aparece.

Também aceita, via `--input`, qualquer CSV de exportação MDF-e oficial que
venha a existir no futuro (mesmo layout genérico origem/destino ou
município/UF), sem alterar a lógica de agregação.

Uso automatico (CIOT, mesmo padrao de descoberta dinamica do RNTRC):
  python etl_mdfe_atlas.py --output-dir public/tools/atlas-market-intelligence/data

Uso manual (exportação MDF-e oficial, se/quando existir):
  python etl_mdfe_atlas.py exportacao_oficial.csv \
    --output-dir public/tools/atlas-market-intelligence/data \
    --source-url 'https://www.gov.br/antt/.../movimentacao-de-cargas' \
    --competence '2026-07'
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import math
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

IBGE_MUNICIPIOS = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
DEFAULT_SOURCE_PAGE = "https://www.gov.br/antt/pt-br/assuntos/cargas/dadostrc/movimentacao-de-cargas"
CIOT_CKAN_PACKAGE = "https://dados.antt.gov.br/api/3/action/package_show?id=ciot"
CIOT_SOURCE_PAGE = "https://dados.antt.gov.br/dataset/ciot"
USER_AGENT = "AtlasGR-MarketIntelligence/1.0 (+data engineering)"
# CodeQL (achado real de finalização, PR #344): `discover_latest_ciot` extrai `resource["url"]`
# direto da resposta JSON da API CKAN da ANTT e usa esse valor num `urllib.request.urlopen`
# seguinte -- URL vindo inteiro (host incluso) de uma resposta de rede, sem checar
# esquema/host antes de buscar. O filtro anterior (regex `_ciots\.csv$` em algum lugar da
# string) não impede um host arbitrário. Mesmo padrão de allowlist já usado em
# `fetchWithTimeout`/`safeFetch` no app real (`src/shared/security/urlGuard.ts`, PR #339):
# fixa o host esperado e recusa qualquer outro antes de buscar.
CIOT_ALLOWED_HOSTS = {"dados.antt.gov.br"}


def assert_allowed_source_url(url: str, allowed_hosts: set[str]) -> str:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in allowed_hosts:
        raise RuntimeError(
            f"URL de origem fora do host oficial esperado ({sorted(allowed_hosts)}): {url!r}"
        )
    return url

ALIASES = {
    "municipio_origem": ["municipio_origem", "origem_municipio", "municipio_de_origem", "origem"],
    "uf_origem": ["uf_origem", "origem_uf", "estado_origem", "uf_de_origem"],
    "municipio_destino": ["municipio_destino", "destino_municipio", "municipio_de_destino", "destino"],
    "uf_destino": ["uf_destino", "destino_uf", "estado_destino", "uf_de_destino"],
    "municipio": ["municipio", "localidade", "municipio_nome"],
    "uf": ["uf", "estado", "sigla_uf"],
    # "quantidade_ciots" (1 CIOT ~ 1 operacao de transporte contratada) mapeia para
    # "viagens" -- nunca para "mdfe" (contagem de manifestos), que o CIOT nao mede.
    "viagens": ["viagens", "numero_de_viagens", "qtd_viagens", "jornadas", "quantidade_viagens", "quantidade_ciots"],
    "mdfe": ["mdfe", "mdf_e", "quantidade_mdfe", "qtd_mdfe", "manifestos", "quantidade_de_mdf_e"],
    "toneladas": ["toneladas", "peso_toneladas", "peso_t", "ton", "peso_carga_toneladas"],
    "tku": ["tku", "tonelada_quilometro_util", "toneladas_quilometro_util"],
    "ncm_grupo": ["ncm_grupo", "ncm", "grupo_ncm", "produto", "tipo_carga", "grupo_de_produto", "ncm_carga"],
    "periodo": ["periodo", "mes_ano", "ano_mes", "competencia", "data", "ano_mes_emissao"],
}


def discover_latest_ciot() -> tuple[str, str]:
    """Retorna (url, competencia AAAA-MM) do CSV CIOT mais recente no portal ANTT."""
    payload = json.loads(http_bytes(CIOT_CKAN_PACKAGE).decode("utf-8"))
    if not payload.get("success"):
        raise RuntimeError("CKAN ANTT nao retornou success=true para o pacote CIOT")
    candidates: list[tuple[str, str]] = []
    for resource in payload["result"].get("resources", []):
        url = str(resource.get("url") or "")
        if resource.get("format") != "CSV":
            continue
        match = re.search(r"(0[1-9]|1[0-2])_(\d{4})_ciots\.csv", url)
        if not match:
            continue
        candidates.append((f"{match.group(2)}-{match.group(1)}", url))
    if not candidates:
        raise RuntimeError("Nenhum recurso CSV CIOT encontrado no pacote oficial da ANTT")
    candidates.sort(key=lambda item: item[0], reverse=True)
    best_url = assert_allowed_source_url(candidates[0][1], CIOT_ALLOWED_HOSTS)
    return best_url, candidates[0][0]


def download_with_retry(url: str, target: Path, attempts: int = 4, timeout: int = 300) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        if target.exists() and target.stat().st_size >= 1000:
            return
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=timeout) as response, target.open("wb") as output:  # noqa: S310
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
        except OSError as error:
            last_error = error
            target.unlink(missing_ok=True)
            if attempt < attempts:
                time.sleep(2**attempt)
    if not target.exists() or target.stat().st_size < 1000:
        raise RuntimeError(f"Falha ao baixar {url} apos {attempts} tentativas: {last_error}")


def norm(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(c for c in text if not unicodedata.combining(c)).upper().strip()
    return re.sub(r"[^A-Z0-9]+", " ", text).strip()


def norm_header(value: Any) -> str:
    return norm(value).lower().replace(" ", "_")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_number(value: Any) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if math.isfinite(number) else None
    text = str(value).strip().replace(" ", "")
    text = re.sub(r"[^0-9,.-]", "", text)
    if not text:
        return None
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".") if text.rfind(",") > text.rfind(".") else text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        number = float(text)
        return number if math.isfinite(number) else None
    except ValueError:
        return None


def detect_encoding(path: Path) -> str:
    raw = path.read_bytes()[:65536]
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            raw.decode(encoding)
            return encoding
        except UnicodeDecodeError:
            pass
    return "latin-1"


def detect_dialect(sample: str) -> csv.Dialect:
    try:
        return csv.Sniffer().sniff(sample, delimiters=";,\t|")
    except csv.Error:
        return csv.excel


def map_columns(fieldnames: Iterable[str] | None) -> dict[str, str]:
    normalized = {norm_header(name): name for name in fieldnames or []}
    mapped: dict[str, str] = {}
    for target, aliases in ALIASES.items():
        for alias in aliases:
            source = normalized.get(norm_header(alias))
            if source:
                mapped[target] = source
                break
    return mapped


def http_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=180) as response:  # noqa: S310
        payload = response.read()
    return gzip.decompress(payload) if payload[:2] == b"\x1f\x8b" else payload


def load_ibge(cache: Path) -> dict[tuple[str, str], dict[str, Any]]:
    cache.parent.mkdir(parents=True, exist_ok=True)
    if not cache.exists():
        cache.write_bytes(http_bytes(IBGE_MUNICIPIOS))
    lookup: dict[tuple[str, str], dict[str, Any]] = {}
    for row in json.loads(cache.read_text(encoding="utf-8")):
        uf = ((row.get("microrregiao") or {}).get("mesorregiao") or {}).get("UF") or {}
        if not uf:
            immediate = row.get("regiao-imediata") or {}
            uf = ((immediate.get("regiao-intermediaria") or {}).get("UF")) or {}
        sigla = str(uf.get("sigla") or "").upper()
        name = str(row.get("nome") or "")
        if sigla and name:
            lookup[(sigla, norm(name))] = {"ibgeCode": str(row["id"]), "name": name, "uf": sigla}
    return lookup


def add_metric(target: dict[str, float | None], key: str, value: float | None) -> None:
    if value is None:
        return
    current = target.get(key)
    target[key] = value if current is None else current + value


def empty_metrics() -> dict[str, float | None]:
    return {"trips": None, "manifests": None, "tonnes": None, "tku": None}


def aggregate(path: Path, ibge: dict[tuple[str, str], dict[str, Any]]) -> dict[str, Any]:
    encoding = detect_encoding(path)
    origin_agg: dict[str, dict[str, Any]] = {}
    destination_agg: dict[str, dict[str, Any]] = {}
    flows: dict[tuple[str, str, str], dict[str, Any]] = {}
    cargo_mix: defaultdict[str, float] = defaultdict(float)
    stats: defaultdict[str, int] = defaultdict(int)

    with path.open("r", encoding=encoding, errors="replace", newline="") as handle:
        sample = handle.read(65536)
        handle.seek(0)
        reader = csv.DictReader(handle, dialect=detect_dialect(sample))
        recognized = map_columns(reader.fieldnames)
        origin_destination = all(key in recognized for key in ("municipio_origem", "uf_origem", "municipio_destino", "uf_destino"))
        municipal_only = all(key in recognized for key in ("municipio", "uf"))
        if not origin_destination and not municipal_only:
            raise SystemExit("Layout MDF-e não reconhecido: exigido origem+destino+UFs ou município+UF.")
        if not any(metric in recognized for metric in ("viagens", "mdfe", "toneladas", "tku")):
            raise SystemExit("Layout MDF-e não contém nenhuma métrica quantitativa reconhecida.")

        for row in reader:
            stats["rowsRead"] += 1
            metrics = {
                "trips": parse_number(row.get(recognized.get("viagens", ""))),
                "manifests": parse_number(row.get(recognized.get("mdfe", ""))),
                "tonnes": parse_number(row.get(recognized.get("toneladas", ""))),
                "tku": parse_number(row.get(recognized.get("tku", ""))),
            }
            cargo = str(row.get(recognized.get("ncm_grupo", ""), "") or "").strip()
            if cargo:
                cargo_mix[norm(cargo)] += metrics["tonnes"] or metrics["manifests"] or metrics["trips"] or 0

            if origin_destination:
                origin = ibge.get((str(row.get(recognized["uf_origem"], "")).strip().upper(), norm(row.get(recognized["municipio_origem"], ""))))
                destination = ibge.get((str(row.get(recognized["uf_destino"], "")).strip().upper(), norm(row.get(recognized["municipio_destino"], ""))))
                if not origin or not destination:
                    stats["unmatchedGeographyRows"] += 1
                    continue
                stats["matchedRows"] += 1
                if origin["uf"] != destination["uf"]:
                    stats["interstateRows"] += 1
                for store, geo in ((origin_agg, origin), (destination_agg, destination)):
                    item = store.setdefault(geo["ibgeCode"], {**geo, **empty_metrics()})
                    for key, value in metrics.items(): add_metric(item, key, value)
                cargo_key = norm(cargo) if cargo else "SEM_CATEGORIA_OBSERVADA"
                key = (origin["ibgeCode"], destination["ibgeCode"], cargo_key)
                flow = flows.setdefault(key, {
                    "originIbgeCode": origin["ibgeCode"], "originName": origin["name"], "originUf": origin["uf"],
                    "destinationIbgeCode": destination["ibgeCode"], "destinationName": destination["name"], "destinationUf": destination["uf"],
                    "cargoGroup": cargo or None, "interstate": origin["uf"] != destination["uf"], **empty_metrics(),
                })
                for metric, value in metrics.items(): add_metric(flow, metric, value)
            else:
                geo = ibge.get((str(row.get(recognized["uf"], "")).strip().upper(), norm(row.get(recognized["municipio"], ""))))
                if not geo:
                    stats["unmatchedGeographyRows"] += 1
                    continue
                stats["matchedRows"] += 1
                item = origin_agg.setdefault(geo["ibgeCode"], {**geo, **empty_metrics()})
                for key, value in metrics.items(): add_metric(item, key, value)

    flow_rows = sorted(flows.values(), key=lambda row: (row["originUf"], row["originName"], row["destinationUf"], row["destinationName"], row["cargoGroup"] or ""))
    origin_rows = sorted(origin_agg.values(), key=lambda row: (row["uf"], row["name"]))
    destination_rows = sorted(destination_agg.values(), key=lambda row: (row["uf"], row["name"]))
    corridors = sorted(flow_rows, key=lambda row: row.get("tonnes") or row.get("manifests") or row.get("trips") or 0, reverse=True)

    return {
        "flowRows": flow_rows, "originRows": origin_rows, "destinationRows": destination_rows,
        "corridors": corridors, "stats": dict(stats), "cargoMix": dict(cargo_mix), "recognized": recognized,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="ETL de exportação oficial MDF-e / ANTT (ou CIOT como proxy, ver docstring)")
    parser.add_argument("input", type=Path, nargs="?", help="CSV de exportação oficial. Omitido: baixa o CIOT mais recente automaticamente.")
    parser.add_argument("--output-dir", type=Path, default=Path("public/tools/atlas-market-intelligence/data"))
    parser.add_argument("--workdir", type=Path, default=Path(".cache/market-intelligence/mdfe"))
    parser.add_argument("--source-url", default=None)
    parser.add_argument("--competence", default=None, help="Competência explícita do export oficial, ex.: 2026-07. Obrigatório com --input manual.")
    args = parser.parse_args()

    source_kind = "MDF-e (exportacao oficial informada manualmente)"
    if args.input is None:
        url, competence = discover_latest_ciot()
        args.competence = args.competence or competence
        args.source_url = args.source_url or CIOT_SOURCE_PAGE
        raw_dir = args.workdir / "raw" / args.competence
        args.input = raw_dir / Path(url).name
        download_with_retry(url, args.input)
        source_kind = "CIOT (proxy documentado para fluxo origem-destino; NAO e MDF-e literal -- ver FONTES.md)"
    else:
        if not args.competence:
            raise SystemExit("--competence e obrigatorio quando um CSV e informado manualmente via --input")
        args.source_url = args.source_url or DEFAULT_SOURCE_PAGE

    if not args.input.exists() or args.input.stat().st_size <= 0:
        raise SystemExit(f"Entrada MDF-e/CIOT inválida: {args.input}")

    ibge = load_ibge(args.workdir / "ibge_municipios.json")
    result = aggregate(args.input, ibge)
    origin_rows, destination_rows, corridors = result["originRows"], result["destinationRows"], result["corridors"]
    stats, cargo_mix, recognized = result["stats"], result["cargoMix"], result["recognized"]

    args.output_dir.mkdir(parents=True, exist_ok=True)
    outputs = {
        "origins": args.output_dir / "mdfe_origens_municipios.json",
        "destinations": args.output_dir / "mdfe_destinos_municipios.json",
        "corridors": args.output_dir / "mdfe_corredores.json",
    }
    outputs["origins"].write_text(json.dumps(origin_rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    outputs["destinations"].write_text(json.dumps(destination_rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    outputs["corridors"].write_text(json.dumps(corridors[:5000], ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    total_rows = max(1, stats.get("rowsRead", 0))
    metadata_path = args.output_dir / "mdfe.metadata.json"
    metadata = {
        "dataset": "ANTT / Movimentação de Cargas",
        "sourceKind": source_kind,
        "sourceUrl": args.source_url,
        "competence": args.competence,
        "processedAt": datetime.now(timezone.utc).isoformat(),
        "inputFile": args.input.name,
        "inputBytes": args.input.stat().st_size,
        "inputSha256": sha256_file(args.input),
        "recognizedColumns": recognized,
        "stats": dict(stats),
        "unmatchedGeographyRate": stats.get("unmatchedGeographyRows", 0) / total_rows,
        "cargoGroupsObserved": len(cargo_mix),
        "outputs": {name: {"file": path.name, "sha256": sha256_file(path)} for name, path in outputs.items()},
        "semantics": {
            "rntrc": "estoque/presença logística",
            "mdfe": "fluxo logístico observado",
            "interstate": "origem UF diferente de destino UF",
            "tku": "somente publicado quando presente no export oficial; nunca inferido de Haversine",
        },
        "limitations": [
            "A página pública da ANTT de MDF-e expõe apenas um painel interativo (Power BI), sem exportação aberta; CIOT é usado como proxy documentado de fluxo origem-destino até uma exportação MDF-e oficial existir.",
            "CIOT mede operação de transporte contratada (1 CIOT = 1 operação), não manifesto eletrônico; o campo 'manifests' (contagem de MDF-e) permanece null quando a fonte é CIOT.",
            "Campos ausentes permanecem null e não são convertidos em zero.",
            "Top corredores no JSON web é limitado a 5.000 linhas. O agregado completo por origem+destino+carga "
            "(mdfe_fluxos.json, granularidade de linha) não é publicado no bundle web: excede o limite de 100MB "
            "por arquivo do GitHub (161MB observado na competência 2026-07, ~1200 grupos NCM por par de município). "
            "Permanece reproduzível localmente rodando este ETL; nenhum código do produto le esse arquivo hoje.",
        ],
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
