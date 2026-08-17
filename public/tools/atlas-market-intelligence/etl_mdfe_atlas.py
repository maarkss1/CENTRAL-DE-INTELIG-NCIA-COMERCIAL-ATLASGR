#!/usr/bin/env python3
"""ETL de exportações oficiais ANTT / Movimentação de Cargas (MDF-e).

A página pública da ANTT atualmente expõe o painel interativo. Este script NÃO
raspa valores do HTML e NÃO inventa MDF-e ausente. Ele processa CSV exportado do
painel/fonte oficial quando disponível e produz:

- fluxo origem-destino por código IBGE;
- agregação municipal de origem e destino;
- corredores principais;
- interestadualidade;
- toneladas, MDF-e, viagens e TKU somente quando observados;
- metadata com competência, hash, campos reconhecidos e perdas geográficas.

Uso:
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
import unicodedata
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

IBGE_MUNICIPIOS = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
DEFAULT_SOURCE_PAGE = "https://www.gov.br/antt/pt-br/assuntos/cargas/dadostrc/movimentacao-de-cargas"

ALIASES = {
    "municipio_origem": ["municipio_origem", "origem_municipio", "municipio_de_origem", "origem"],
    "uf_origem": ["uf_origem", "origem_uf", "estado_origem", "uf_de_origem"],
    "municipio_destino": ["municipio_destino", "destino_municipio", "municipio_de_destino", "destino"],
    "uf_destino": ["uf_destino", "destino_uf", "estado_destino", "uf_de_destino"],
    "municipio": ["municipio", "localidade", "municipio_nome"],
    "uf": ["uf", "estado", "sigla_uf"],
    "viagens": ["viagens", "numero_de_viagens", "qtd_viagens", "jornadas", "quantidade_viagens"],
    "mdfe": ["mdfe", "mdf_e", "quantidade_mdfe", "qtd_mdfe", "manifestos", "quantidade_de_mdf_e"],
    "toneladas": ["toneladas", "peso_toneladas", "peso_t", "ton", "peso_carga_toneladas"],
    "tku": ["tku", "tonelada_quilometro_util", "toneladas_quilometro_util"],
    "ncm_grupo": ["ncm_grupo", "ncm", "grupo_ncm", "produto", "tipo_carga", "grupo_de_produto"],
    "periodo": ["periodo", "mes_ano", "ano_mes", "competencia", "data", "ano_mes_emissao"],
}


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
        uf = row.get("microrregiao", {}).get("mesorregiao", {}).get("UF", {})
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


def main() -> int:
    parser = argparse.ArgumentParser(description="ETL de exportação oficial MDF-e / ANTT")
    parser.add_argument("input", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("public/tools/atlas-market-intelligence/data"))
    parser.add_argument("--workdir", type=Path, default=Path(".cache/market-intelligence/mdfe"))
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_PAGE)
    parser.add_argument("--competence", required=True, help="Competência explícita do export oficial, ex.: 2026-07")
    args = parser.parse_args()

    if not args.input.exists() or args.input.stat().st_size <= 0:
        raise SystemExit(f"Entrada MDF-e inválida: {args.input}")

    ibge = load_ibge(args.workdir / "ibge_municipios.json")
    encoding = detect_encoding(args.input)
    origin_agg: dict[str, dict[str, Any]] = {}
    destination_agg: dict[str, dict[str, Any]] = {}
    flows: dict[tuple[str, str, str], dict[str, Any]] = {}
    cargo_mix: defaultdict[str, float] = defaultdict(float)
    stats = defaultdict(int)
    recognized: dict[str, str]

    with args.input.open("r", encoding=encoding, errors="replace", newline="") as handle:
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

    args.output_dir.mkdir(parents=True, exist_ok=True)
    flow_rows = sorted(flows.values(), key=lambda row: (row["originUf"], row["originName"], row["destinationUf"], row["destinationName"], row["cargoGroup"] or ""))
    origin_rows = sorted(origin_agg.values(), key=lambda row: (row["uf"], row["name"]))
    destination_rows = sorted(destination_agg.values(), key=lambda row: (row["uf"], row["name"]))
    corridors = sorted(flow_rows, key=lambda row: row.get("tonnes") or row.get("manifests") or row.get("trips") or 0, reverse=True)

    outputs = {
        "flows": args.output_dir / "mdfe_fluxos.json",
        "origins": args.output_dir / "mdfe_origens_municipios.json",
        "destinations": args.output_dir / "mdfe_destinos_municipios.json",
        "corridors": args.output_dir / "mdfe_corredores.json",
    }
    outputs["flows"].write_text(json.dumps(flow_rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    outputs["origins"].write_text(json.dumps(origin_rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    outputs["destinations"].write_text(json.dumps(destination_rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    outputs["corridors"].write_text(json.dumps(corridors[:5000], ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    total_rows = max(1, stats["rowsRead"])
    metadata_path = args.output_dir / "mdfe.metadata.json"
    metadata = {
        "dataset": "ANTT / Movimentação de Cargas baseada em MDF-e",
        "sourceUrl": args.source_url,
        "competence": args.competence,
        "processedAt": datetime.now(timezone.utc).isoformat(),
        "inputFile": args.input.name,
        "inputBytes": args.input.stat().st_size,
        "inputSha256": sha256_file(args.input),
        "recognizedColumns": recognized,
        "stats": dict(stats),
        "unmatchedGeographyRate": stats["unmatchedGeographyRows"] / total_rows,
        "cargoGroupsObserved": len(cargo_mix),
        "outputs": {name: {"file": path.name, "sha256": sha256_file(path)} for name, path in outputs.items()},
        "semantics": {
            "rntrc": "estoque/presença logística",
            "mdfe": "fluxo logístico observado",
            "interstate": "origem UF diferente de destino UF",
            "tku": "somente publicado quando presente no export oficial; nunca inferido de Haversine",
        },
        "limitations": [
            "A página pública da ANTT expõe painel interativo; este ETL exige exportação oficial identificável.",
            "Campos ausentes permanecem null e não são convertidos em zero.",
            "Top corredores no JSON web é limitado a 5.000 linhas; o agregado completo permanece reproduzível pelo ETL.",
        ],
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
