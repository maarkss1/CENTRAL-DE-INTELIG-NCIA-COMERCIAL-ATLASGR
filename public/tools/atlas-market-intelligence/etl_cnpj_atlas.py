#!/usr/bin/env python3
"""Pipeline nacional CNPJ -> ICP Atlas GR.

Processa ZIPs oficiais da Receita sem expor a base bruta ao frontend.
Usa SQLite temporario e publica somente agregados municipais por codigo IBGE.
"""
from __future__ import annotations

import argparse
import base64
import csv
import gzip
import hashlib
import io
import json
import re
import sqlite3
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from cnpj_company_pipeline import build_company_snapshot

# A Receita Federal migrou o antigo indice HTML estatico (arquivos.receitafederal.gov.br/dados/...)
# para um compartilhamento publico Nextcloud/SERPRO+. O host raiz redireciona (302) para
# /index.php/s/<token>; o conteudo e navegavel via WebDAV em /public.php/webdav/ usando o token
# do share como usuario HTTP Basic e senha vazia. Descobrimos o token dinamicamente em vez de
# fixa-lo, pois o Nextcloud pode rotacionar o link de compartilhamento no futuro.
BASE_HOST = "https://arquivos.receitafederal.gov.br"
CNPJ_REMOTE_PATH = "Dados/Cadastros/CNPJ"
IBGE_MUNICIPIOS = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
USER_AGENT = "AtlasGR-MarketIntelligence/1.0 (+data engineering)"
ACTIVE_SITUATION = "02"
DAV_NS = {"d": "DAV:"}


@dataclass(frozen=True)
class ArchiveMeta:
    name: str
    url: str
    size: int
    sha256: str


def request_bytes(url: str, timeout: int = 180) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        payload = response.read()
        # urllib nao descomprime automaticamente; alguns servidores (ex.: IBGE) gzipam a
        # resposta mesmo sem Accept-Encoding explicito no pedido.
        if response.headers.get("Content-Encoding", "").lower() == "gzip" or payload[:2] == b"\x1f\x8b":
            payload = gzip.decompress(payload)
        return payload


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def norm(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^A-Za-z0-9]+", " ", text).upper()).strip()


def discover_public_share_token() -> str:
    request = urllib.request.Request(f"{BASE_HOST}/", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310
        final_url = response.geturl()
    match = re.search(r"/index\.php/s/([A-Za-z0-9]+)", final_url)
    if not match:
        raise RuntimeError("Nao foi possivel descobrir o token de compartilhamento publico da Receita Federal (Nextcloud)")
    return match.group(1)


def basic_auth_header(token: str) -> str:
    return "Basic " + base64.b64encode(f"{token}:".encode()).decode()


def webdav_url(path: str) -> str:
    return f"{BASE_HOST}/public.php/webdav/{path}"


def propfind_children(url: str, token: str) -> list[tuple[str, bool]]:
    request = urllib.request.Request(
        url,
        method="PROPFIND",
        headers={"User-Agent": USER_AGENT, "Authorization": basic_auth_header(token), "Depth": "1"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310
        payload = response.read()
    root = ET.fromstring(payload)
    base_path = urllib.parse.unquote(urllib.parse.urlsplit(url).path).rstrip("/") + "/"
    children: list[tuple[str, bool]] = []
    for entry in root.findall("d:response", DAV_NS):
        href = urllib.parse.unquote(entry.findtext("d:href", default="", namespaces=DAV_NS))
        if href.rstrip("/") + "/" == base_path:
            continue
        is_collection = entry.find(".//d:resourcetype/d:collection", DAV_NS) is not None
        name = href.rstrip("/").rsplit("/", 1)[-1]
        children.append((name, is_collection))
    return children


def discover_latest_competence(token: str) -> str:
    children = propfind_children(webdav_url(f"{CNPJ_REMOTE_PATH}/"), token)
    found = sorted(name for name, is_dir in children if is_dir and re.fullmatch(r"20\d{2}-(?:0[1-9]|1[0-2])", name))
    if not found:
        raise RuntimeError("Nao foi possivel descobrir a competencia mais recente no indice oficial da Receita")
    return found[-1]


def list_remote_archives(token: str, competence: str, include_company_details: bool = False) -> list[tuple[str, str]]:
    folder = f"{CNPJ_REMOTE_PATH}/{competence}/"
    children = propfind_children(webdav_url(folder), token)
    names = sorted(name for name, is_dir in children if not is_dir and name.lower().endswith(".zip"))
    wanted = [n for n in names if re.match(r"(?:Empresas|Estabelecimentos)\d+\.zip$", n, re.I)]
    if "Municipios.zip" in names:
        wanted.append("Municipios.zip")
    if include_company_details:
        for required in ["Simples.zip", "Cnaes.zip", "Naturezas.zip", "Qualificacoes.zip", "Motivos.zip"]:
            if required not in names:
                raise RuntimeError(f"Indice Receita sem {required} para {competence}")
            wanted.append(required)
    if not any(n.lower().startswith("empresas") for n in wanted) or not any(n.lower().startswith("estabelecimentos") for n in wanted) or "Municipios.zip" not in wanted:
        raise RuntimeError(f"Indice Receita incompleto para {competence}")
    return [(name, webdav_url(f"{folder}{name}")) for name in wanted]


def download_archive(name: str, url: str, target_dir: Path, token: str, attempts: int = 4) -> ArchiveMeta:
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / name
    partial = target.with_suffix(target.suffix + ".part")
    if target.exists() and zipfile.is_zipfile(target):
        return ArchiveMeta(name, url, target.stat().st_size, sha256_file(target))
    if target.exists():
        target.unlink()
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            received = partial.stat().st_size if partial.exists() else 0
            headers = {
                "User-Agent": USER_AGENT,
                "Authorization": basic_auth_header(token),
                "Accept-Encoding": "identity",
                "Range": f"bytes={received}-",
            }
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=600) as response:  # noqa: S310
                resumed = received > 0 and getattr(response, "status", 200) == 206
                if received and not resumed:
                    received = 0
                expected = int(response.headers.get("Content-Length") or 0) + received
                mode = "ab" if resumed else "wb"
                next_progress = received + 256 * 1024 * 1024
                with partial.open(mode) as output:
                    while chunk := response.read(1024 * 1024):
                        output.write(chunk)
                        received += len(chunk)
                        if received >= next_progress:
                            print(json.dumps({"phase": "DOWNLOAD", "file": name, "bytes": received, "expectedBytes": expected}), flush=True)
                            next_progress += 256 * 1024 * 1024
        except OSError as error:
            last_error = error
            if attempt < attempts:
                time.sleep(2**attempt)
                continue
        if partial.exists() and zipfile.is_zipfile(partial):
            partial.replace(target)
            break
        last_error = RuntimeError(f"download parcial/invalido: {partial.stat().st_size if partial.exists() else 0} bytes")
        if attempt < attempts:
            time.sleep(2**attempt)
    if not target.exists() or target.stat().st_size < 100:
        raise RuntimeError(f"Falha ao baixar {name} apos {attempts} tentativas: {last_error}")
    return ArchiveMeta(name, url, target.stat().st_size, sha256_file(target))


def zip_rows(path: Path) -> Iterator[list[str]]:
    with zipfile.ZipFile(path) as archive:
        members = [m for m in archive.infolist() if not m.is_dir()]
        if not members:
            return
        member = max(members, key=lambda item: item.file_size)
        with archive.open(member) as raw:
            yield from csv.reader(io.TextIOWrapper(raw, encoding="latin-1", errors="replace", newline=""), delimiter=";", quotechar='"')


def normalize_cnae(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def tier_for_cnaes(primary: str, secondary: str, taxonomy: dict[str, Any]) -> tuple[str | None, str | None]:
    codes = [normalize_cnae(primary)] + [normalize_cnae(v) for v in re.split(r"[,;\s]+", secondary or "") if v.strip()]
    for tier in taxonomy.get("precedence", ["A", "B", "C"]):
        prefixes = [str(v) for v in taxonomy["tiers"].get(tier, {}).get("cnaePrefixes", [])]
        for code in filter(None, codes):
            if any(code.startswith(prefix) for prefix in prefixes):
                return tier, code
    return None, None


def load_receita_municipalities(path: Path) -> dict[str, str]:
    result = {row[0].strip(): row[1].strip() for row in zip_rows(path) if len(row) >= 2}
    if not result:
        raise RuntimeError("Municipios.zip vazio")
    return result


def load_ibge(cache: Path) -> dict[tuple[str, str], dict[str, Any]]:
    cache.parent.mkdir(parents=True, exist_ok=True)
    if not cache.exists():
        cache.write_bytes(request_bytes(IBGE_MUNICIPIOS))
    lookup: dict[tuple[str, str], dict[str, Any]] = {}
    for row in json.loads(cache.read_text(encoding="utf-8")):
        uf = ((row.get("microrregiao") or {}).get("mesorregiao") or {}).get("UF") or {}
        if not uf:
            immediate = row.get("regiao-imediata") or {}
            uf = ((immediate.get("regiao-intermediaria") or {}).get("UF")) or {}
        sigla, name = str(uf.get("sigla") or "").upper(), str(row.get("nome") or "")
        if sigla and name:
            lookup[(sigla, norm(name))] = {"ibgeCode": str(row["id"]), "name": name, "uf": sigla, "region": (uf.get("regiao") or {}).get("nome")}
    return lookup


def open_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=NORMAL")
    db.executescript("""
      DROP TABLE IF EXISTS candidate_establishment;
      DROP TABLE IF EXISTS company_info;
      CREATE TABLE candidate_establishment (
        cnpj_basic TEXT NOT NULL, cnpj_full TEXT PRIMARY KEY, matrix_branch TEXT,
        uf TEXT NOT NULL, receita_municipality_code TEXT NOT NULL, primary_cnae TEXT,
        matched_cnae TEXT, tier TEXT NOT NULL
      );
      CREATE INDEX idx_candidate_basic ON candidate_establishment(cnpj_basic);
      CREATE TABLE company_info (
        cnpj_basic TEXT PRIMARY KEY, capital_social TEXT, company_size TEXT
      );
    """)
    return db


def process_establishments(db: sqlite3.Connection, archives: list[Path], taxonomy: dict[str, Any]) -> dict[str, int]:
    stats = defaultdict(int)
    sql = "INSERT OR REPLACE INTO candidate_establishment VALUES (?,?,?,?,?,?,?,?)"
    batch: list[tuple[str, ...]] = []
    for archive in archives:
        print(json.dumps({"phase": "AGGREGATE_ESTABLISHMENTS", "file": archive.name,
                          "recordsRead": stats["establishment_rows"]}), flush=True)
        for row in zip_rows(archive):
            stats["establishment_rows"] += 1
            if len(row) < 22 or row[5].strip() != ACTIVE_SITUATION:
                continue
            stats["active_establishments"] += 1
            tier, match = tier_for_cnaes(row[11], row[12], taxonomy)
            if not tier:
                continue
            basic, order, dv = row[0].strip(), row[1].strip(), row[2].strip()
            batch.append((basic, f"{basic}{order}{dv}", row[3].strip(), row[19].strip().upper(), row[20].strip(), normalize_cnae(row[11]), match or "", tier))
            stats[f"tier_{tier}"] += 1
            if len(batch) >= 5000:
                db.executemany(sql, batch); db.commit(); batch.clear()
    if batch:
        db.executemany(sql, batch); db.commit()
    stats["candidate_establishments"] = db.execute("SELECT COUNT(*) FROM candidate_establishment").fetchone()[0]
    stats["candidate_companies"] = db.execute("SELECT COUNT(DISTINCT cnpj_basic) FROM candidate_establishment").fetchone()[0]
    return dict(stats)


def process_companies(db: sqlite3.Connection, archives: list[Path]) -> dict[str, int]:
    candidate_basics = {row[0] for row in db.execute("SELECT DISTINCT cnpj_basic FROM candidate_establishment")}
    stats = defaultdict(int)
    batch: list[tuple[str, str, str]] = []
    for archive in archives:
        print(json.dumps({"phase": "AGGREGATE_COMPANIES", "file": archive.name,
                          "recordsRead": stats["company_rows"]}), flush=True)
        for row in zip_rows(archive):
            stats["company_rows"] += 1
            if len(row) < 6 or row[0].strip() not in candidate_basics:
                continue
            batch.append((row[0].strip(), row[4].strip(), row[5].strip()))
            if len(batch) >= 5000:
                db.executemany("INSERT OR REPLACE INTO company_info VALUES (?,?,?)", batch); db.commit(); batch.clear()
    if batch:
        db.executemany("INSERT OR REPLACE INTO company_info VALUES (?,?,?)", batch); db.commit()
    stats["matched_company_info"] = db.execute("SELECT COUNT(*) FROM company_info").fetchone()[0]
    return dict(stats)


def aggregate(db: sqlite3.Connection, receita_municipalities: dict[str, str], ibge: dict[tuple[str, str], dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    aggregates: dict[str, dict[str, Any]] = {}
    unmatched = 0
    processed = 0
    for matrix_branch, uf, receita_code, tier, size in db.execute("SELECT e.matrix_branch,e.uf,e.receita_municipality_code,e.tier,c.company_size FROM candidate_establishment e LEFT JOIN company_info c ON c.cnpj_basic=e.cnpj_basic"):
        processed += 1
        geo = ibge.get((str(uf).upper(), norm(receita_municipalities.get(str(receita_code), ""))))
        if not geo:
            unmatched += 1; continue
        code = geo["ibgeCode"]
        item = aggregates.setdefault(code, {"ibgeCode": code, "name": geo["name"], "uf": geo["uf"], "region": geo["region"], "total": 0, "tierA": 0, "tierB": 0, "tierC": 0, "headquarters": 0, "branches": 0, "size": {"micro": 0, "small": 0, "other": 0, "unknown": 0}})
        item["total"] += 1; item[f"tier{tier}"] += 1
        item["headquarters" if str(matrix_branch) == "1" else "branches"] += 1
        item["size"][{"01": "micro", "03": "small", "05": "other"}.get(str(size or "").zfill(2), "unknown")] += 1
    return sorted(aggregates.values(), key=lambda x: (x["uf"], x["name"])), {"candidate_rows_aggregated": processed, "municipalities_with_icp": len(aggregates), "unmatched_geography_rows": unmatched}


def select_archives(source_dir: Path) -> tuple[list[Path], list[Path], Path]:
    establishments, companies, municipalities = sorted(source_dir.glob("Estabelecimentos*.zip")), sorted(source_dir.glob("Empresas*.zip")), source_dir / "Municipios.zip"
    if not establishments or not companies or not municipalities.exists():
        raise RuntimeError(f"Arquivos CNPJ incompletos em {source_dir}")
    return establishments, companies, municipalities


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", type=Path, default=Path(".cache/market-intelligence/cnpj"))
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument("--competence")
    parser.add_argument("--no-download", action="store_true")
    parser.add_argument("--taxonomy", type=Path, default=Path(__file__).with_name("icp_taxonomy.v1.json"))
    parser.add_argument("--output", type=Path, default=Path("public/tools/atlas-market-intelligence/data/icp_municipios.json"))
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--companies-output-dir", type=Path, help="Gera snapshot empresarial detalhado particionado por UF")
    parser.add_argument("--companies-uf", help="Restringe a prova detalhada a uma UF")
    parser.add_argument("--companies-municipality-ibge", help="Restringe a prova detalhada a um municipio IBGE")
    parser.add_argument("--companies-chunk-size", type=int, default=10_000)
    args = parser.parse_args()

    started = datetime.now(timezone.utc)
    taxonomy = json.loads(args.taxonomy.read_text(encoding="utf-8"))
    token = None if args.no_download else discover_public_share_token()
    competence = args.competence or (None if args.no_download else discover_latest_competence(token))
    source_dir = args.source_dir or (args.workdir / "raw" / (competence or "manual"))
    archive_meta: list[ArchiveMeta] = []
    if not args.no_download:
        if not competence:
            raise RuntimeError("Competencia CNPJ nao resolvida")
        for name, url in list_remote_archives(token, competence, include_company_details=bool(args.companies_output_dir)):
            archive_meta.append(download_archive(name, url, source_dir, token))

    establishments, companies, municipalities_zip = select_archives(source_dir)
    if not archive_meta:
        archive_meta = [ArchiveMeta(p.name, p.resolve().as_uri(), p.stat().st_size, sha256_file(p)) for p in establishments + companies + [municipalities_zip]]

    db = open_db(args.workdir / "work" / "atlas_cnpj_icp.sqlite")
    try:
        est_stats = process_establishments(db, establishments, taxonomy)
        company_stats = process_companies(db, companies)
        output, geo_stats = aggregate(db, load_receita_municipalities(municipalities_zip), load_ibge(args.workdir / "raw" / "ibge" / "municipios.json"))
    finally:
        db.close()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    metadata_path = args.metadata or args.output.with_suffix(".metadata.json")
    finished = datetime.now(timezone.utc)
    metadata = {
        "dataset": "Receita Federal - Dados Abertos CNPJ / ICP Atlas",
        "competence": competence or "MANUAL_NAO_INFORMADA",
        "processedAt": finished.isoformat(),
        "durationSeconds": round((finished - started).total_seconds(), 3),
        "sourcePortal": f"{BASE_HOST}/index.php/s/{token}" if token else "MANUAL_NAO_INFORMADA",
        "taxonomyVersion": taxonomy["version"],
        "taxonomyStatus": taxonomy.get("status"),
        "archives": [asdict(v) for v in archive_meta],
        "outputSha256": sha256_file(args.output),
        "stats": {**est_stats, **company_stats, **geo_stats},
        "transformations": ["situacao ativa 02", "CNAE principal+secundarios", "precedencia A>B>C", "porte e matriz/filial preservados", "join municipal por codigo IBGE", "agregacao municipal compacta"],
        "limitations": ["taxonomia v1 nao calibrada com ganhos/perdas Atlas", "porte nao promove tier sozinho", "capital social nao vira score", "frota/MDF-e/risco nao sao inferidos do CNPJ"]
    }
    if args.companies_output_dir:
        required = {name: source_dir / name for name in [
            "Simples.zip", "Cnaes.zip", "Naturezas.zip", "Qualificacoes.zip", "Motivos.zip",
        ]}
        missing = [name for name, path in required.items() if not path.exists()]
        if missing:
            raise RuntimeError(f"Arquivos detalhados ausentes em {source_dir}: {', '.join(missing)}")
        ibge_rows = json.loads((args.workdir / "raw" / "ibge" / "municipios.json").read_text(encoding="utf-8"))
        company_manifest = build_company_snapshot(
            competence=competence or "",
            workdir=args.workdir,
            output_root=args.companies_output_dir,
            establishment_archives=establishments,
            company_archives=companies,
            simples_archive=required["Simples.zip"],
            municipalities_archive=municipalities_zip,
            cnaes_archive=required["Cnaes.zip"],
            naturezas_archive=required["Naturezas.zip"],
            qualificacoes_archive=required["Qualificacoes.zip"],
            motivos_archive=required["Motivos.zip"],
            ibge_rows=ibge_rows,
            source_url=f"{BASE_HOST}/index.php/s/{token}" if token else "MANUAL_NAO_INFORMADA",
            filter_uf=args.companies_uf,
            filter_ibge=args.companies_municipality_ibge,
            chunk_size=args.companies_chunk_size,
        )
        metadata["companySnapshot"] = {
            "datasetHash": company_manifest["datasetHash"],
            "recordsExported": company_manifest["stats"]["recordsExported"],
            "activeRecordsExported": company_manifest["stats"].get("activeRecordsExported", 0),
            "filters": company_manifest["filters"],
        }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    if geo_stats["unmatched_geography_rows"]:
        print(f"AVISO: {geo_stats['unmatched_geography_rows']} estabelecimentos ICP sem match IBGE", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
