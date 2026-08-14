#!/usr/bin/env python3
"""ETL RNTRC nacional para Atlas Market Intelligence.

Objetivos:
- descobrir automaticamente o recurso RNTRC mensal mais recente no CKAN da ANTT;
- baixar e cachear o CSV bruto fora do bundle web;
- validar/hash do snapshot;
- filtrar transportadores ATIVOS;
- resolver município por UF + nome contra o cadastro oficial do IBGE;
- agregar ETC/TAC/CTC/equiparada por código IBGE;
- publicar somente JSON municipal compacto para o front.

A base bruta NÃO deve ser copiada para `public/`.

Uso:
    python etl_rntrc_atlas.py --workdir .cache/market-intelligence \
        --output public/tools/atlas-market-intelligence/data/rntrc_municipios.json

Opcional:
    --resource-url <csv>  força uma competência específica.
    --ibge-json <arquivo> usa cache local do cadastro municipal.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

CKAN_PACKAGE = "https://dados.antt.gov.br/api/3/action/package_show?id=rntrc"
IBGE_MUNICIPIOS = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
USER_AGENT = "AtlasGR-MarketIntelligence/1.0 (+data engineering)"


@dataclass(frozen=True)
class ResourceMeta:
    id: str
    name: str
    url: str
    last_modified: str | None
    size: int | None
    competence: str | None


@dataclass
class Agg:
    transporters: int = 0
    etc: int = 0
    tac: int = 0
    ctc: int = 0
    etc_equiparada: int = 0


def request_bytes(url: str, timeout: int = 180) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - official URLs only
        return response.read()


def request_json(url: str, timeout: int = 120) -> Any:
    return json.loads(request_bytes(url, timeout=timeout).decode("utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def norm(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(char for char in text if not unicodedata.combining(char)).upper().strip()
    return re.sub(r"[^A-Z0-9]+", " ", text).strip()


def parse_competence(name: str, url: str) -> str | None:
    candidates = f"{name} {url}"
    match = re.search(r"(?:^|\D)(0?[1-9]|1[0-2])[_/\- ]?(20\d{2})(?:\D|$)", candidates)
    if match:
        return f"{match.group(2)}-{int(match.group(1)):02d}"
    match = re.search(r"\b(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[^0-9]*(20\d{2}|\d{2})\b", norm(candidates))
    if not match:
        return None
    months = {"JAN": 1, "FEV": 2, "MAR": 3, "ABR": 4, "MAI": 5, "JUN": 6, "JUL": 7, "AGO": 8, "SET": 9, "OUT": 10, "NOV": 11, "DEZ": 12}
    year = int(match.group(2))
    if year < 100:
        year += 2000
    return f"{year:04d}-{months[match.group(1)]:02d}"


def discover_latest_resource() -> ResourceMeta:
    payload = request_json(CKAN_PACKAGE)
    if not payload.get("success"):
        raise RuntimeError("CKAN ANTT não retornou success=true para o pacote RNTRC")

    resources: list[ResourceMeta] = []
    for raw in payload["result"].get("resources", []):
        url = str(raw.get("url") or "")
        name = str(raw.get("name") or "")
        if not url.lower().endswith(".csv") or "transportadores_rntrc" not in url.lower():
            continue
        competence = parse_competence(name, url)
        resources.append(ResourceMeta(
            id=str(raw.get("id") or ""),
            name=name,
            url=url,
            last_modified=raw.get("last_modified"),
            size=int(raw["size"]) if str(raw.get("size") or "").isdigit() else None,
            competence=competence,
        ))

    if not resources:
        raise RuntimeError("Nenhum recurso CSV RNTRC foi encontrado no pacote oficial da ANTT")

    resources.sort(key=lambda item: (item.competence or "0000-00", item.last_modified or ""), reverse=True)
    return resources[0]


def download_cached(resource: ResourceMeta, workdir: Path) -> Path:
    raw_dir = workdir / "raw" / "rntrc" / (resource.competence or "sem_competencia")
    raw_dir.mkdir(parents=True, exist_ok=True)
    target = raw_dir / Path(urllib.parse.urlparse(resource.url).path).name
    if target.exists() and target.stat().st_size > 1024:
        return target
    payload = request_bytes(resource.url, timeout=600)
    if len(payload) < 1024:
        raise RuntimeError(f"Download RNTRC retornou apenas {len(payload)} bytes; snapshot rejeitado")
    target.write_bytes(payload)
    return target


def load_ibge(path: Path | None, workdir: Path) -> tuple[dict[tuple[str, str], dict[str, Any]], Path]:
    cache = path or (workdir / "raw" / "ibge" / "municipios.json")
    cache.parent.mkdir(parents=True, exist_ok=True)
    if not cache.exists():
        payload = request_bytes(IBGE_MUNICIPIOS)
        cache.write_bytes(payload)
    rows = json.loads(cache.read_text(encoding="utf-8"))

    lookup: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        uf = row.get("microrregiao", {}).get("mesorregiao", {}).get("UF", {})
        if not uf:
            regiao_imediata = row.get("regiao-imediata") or {}
            uf = (((regiao_imediata.get("regiao-intermediaria") or {}).get("UF")) or {})
        sigla = str(uf.get("sigla") or "").upper()
        if not sigla:
            continue
        lookup[(sigla, norm(row.get("nome")))] = {
            "ibge_code": str(row.get("id")),
            "municipality": row.get("nome"),
            "uf": sigla,
            "region": (uf.get("regiao") or {}).get("nome"),
        }
    return lookup, cache


def sniff_csv(path: Path) -> tuple[str, str]:
    sample = path.read_bytes()[:65536]
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            text = sample.decode(encoding)
            dialect = csv.Sniffer().sniff(text, delimiters=";,\t|")
            return encoding, dialect.delimiter
        except (UnicodeDecodeError, csv.Error):
            continue
    return "latin-1", ";"


def iter_rows(path: Path) -> Iterable[dict[str, str]]:
    encoding, delimiter = sniff_csv(path)
    with path.open("r", encoding=encoding, errors="replace", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=delimiter)
        for row in reader:
            yield {norm(key).replace(" ", "_").lower(): (value or "").strip() for key, value in row.items() if key}


def pick(row: dict[str, str], *names: str) -> str:
    for name in names:
        value = row.get(name)
        if value:
            return value
    return ""


def is_active(value: str) -> bool:
    normalized = norm(value)
    return normalized in {"ATIVO", "ATIVA"} or normalized.startswith("ATIV")


def category_bucket(value: str) -> str | None:
    normalized = norm(value)
    if normalized.startswith("ETC"):
        return "etc"
    if normalized.startswith("TAC"):
        return "tac"
    if normalized.startswith("CTC"):
        return "ctc"
    return None


def aggregate(path: Path, ibge: dict[tuple[str, str], dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    totals: dict[str, Agg] = defaultdict(Agg)
    geography: dict[str, dict[str, Any]] = {}
    unmatched: dict[str, int] = defaultdict(int)
    processed = active = 0

    for row in iter_rows(path):
        processed += 1
        status = pick(row, "situacao_rntrc", "situacao", "status")
        if status and not is_active(status):
            continue
        active += 1
        uf = pick(row, "uf", "sg_uf").upper()
        municipality = pick(row, "municipio", "nome_municipio")
        geo = ibge.get((uf, norm(municipality)))
        if not geo:
            unmatched[f"{municipality}/{uf}"] += 1
            continue

        code = geo["ibge_code"]
        geography[code] = geo
        agg = totals[code]
        agg.transporters += 1
        bucket = category_bucket(pick(row, "categoria_transportador", "categoria"))
        if bucket == "etc":
            agg.etc += 1
            if norm(pick(row, "equiparado")) in {"SIM", "S", "TRUE", "1"}:
                agg.etc_equiparada += 1
        elif bucket == "tac":
            agg.tac += 1
        elif bucket == "ctc":
            agg.ctc += 1

    output = []
    for code, agg in totals.items():
        geo = geography[code]
        output.append({
            "ibgeCode": code,
            "name": geo["municipality"],
            "uf": geo["uf"],
            "region": geo["region"],
            "transporters": agg.transporters,
            "etc": agg.etc,
            "tac": agg.tac,
            "ctc": agg.ctc,
            "etcEquiparada": agg.etc_equiparada,
        })
    output.sort(key=lambda row: (row["uf"], row["name"]))
    stats = {
        "rows_processed": processed,
        "rows_active": active,
        "municipalities_matched": len(output),
        "rows_unmatched_geography": sum(unmatched.values()),
        "distinct_unmatched_geography": len(unmatched),
    }
    return output, stats


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", type=Path, default=Path(".cache/market-intelligence"))
    parser.add_argument("--output", type=Path, default=Path("public/tools/atlas-market-intelligence/data/rntrc_municipios.json"))
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--resource-url")
    parser.add_argument("--competence")
    parser.add_argument("--ibge-json", type=Path)
    args = parser.parse_args()

    args.workdir.mkdir(parents=True, exist_ok=True)
    if args.resource_url:
        resource = ResourceMeta(id="manual", name="manual", url=args.resource_url, last_modified=None, size=None, competence=args.competence or parse_competence("", args.resource_url))
    else:
        resource = discover_latest_resource()

    source = download_cached(resource, args.workdir)
    ibge, ibge_path = load_ibge(args.ibge_json, args.workdir)
    rows, stats = aggregate(source, ibge)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    metadata_path = args.metadata or args.output.with_suffix(".metadata.json")
    metadata = {
        "dataset": "ANTT RNTRC",
        "resource": asdict(resource),
        "downloadedAt": datetime.now(timezone.utc).isoformat(),
        "rawSha256": sha256_file(source),
        "rawBytes": source.stat().st_size,
        "ibgeCache": str(ibge_path),
        "output": str(args.output),
        "outputSha256": sha256_file(args.output),
        "stats": stats,
        "transformations": [
            "filtro de situacao RNTRC ativa quando a coluna existe",
            "normalizacao textual apenas para lookup",
            "join municipio+UF contra cadastro IBGE",
            "agregacao municipal por codigo IBGE",
            "contagem ETC/TAC/CTC e ETC equiparada",
        ],
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))

    if stats["rows_unmatched_geography"]:
        print("AVISO: existem linhas RNTRC sem correspondencia IBGE; revisar antes de promover o dataset como completo.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
