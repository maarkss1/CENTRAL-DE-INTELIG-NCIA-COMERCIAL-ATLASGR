#!/usr/bin/env python3
"""Pipeline nacional CNPJ -> ICP Atlas GR.

Processa ZIPs oficiais da Receita sem expor a base bruta ao frontend.
Usa SQLite temporario e publica somente agregados municipais por codigo IBGE.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sqlite3
import sys
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

BASE_INDEX = "https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/"
IBGE_MUNICIPIOS = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
USER_AGENT = "AtlasGR-MarketIntelligence/1.0 (+data engineering)"
ACTIVE_SITUATION = "02"


@dataclass(frozen=True)
class ArchiveMeta:
    name: str
    url: str
    size: int
    sha256: str


def request_bytes(url: str, timeout: int = 180) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        return response.read()


def request_text(url: str, timeout: int = 180) -> str:
    payload = request_bytes(url, timeout)
    for encoding in ("utf-8", "latin-1"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            pass
    return payload.decode("latin-1", errors="replace")


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


def discover_latest_competence() -> str:
    html = request_text(BASE_INDEX)
    found = sorted(set(re.findall(r"\b(20\d{2}-(?:0[1-9]|1[0-2]))/", html)))
    if not found:
        raise RuntimeError("Nao foi possivel descobrir a competencia mais recente no indice oficial da Receita")
    return found[-1]


def list_remote_archives(competence: str) -> list[tuple[str, str]]:
    base = urllib.parse.urljoin(BASE_INDEX, f"{competence}/")
    html = request_text(base)
    names = sorted(set(re.findall(r'href=["\']([^"\']+\.zip)["\']', html, flags=re.I)))
    wanted = [n for n in names if re.match(r"(?:Empresas|Estabelecimentos)\d+\.zip$", n, re.I)]
    if "Municipios.zip" in names:
        wanted.append("Municipios.zip")
    if "Cnaes.zip" in names:
        wanted.append("Cnaes.zip")
    if not any(n.lower().startswith("empresas") for n in wanted) or not any(n.lower().startswith("estabelecimentos") for n in wanted) or "Municipios.zip" not in wanted:
        raise RuntimeError(f"Indice Receita incompleto para {competence}")
    return [(name, urllib.parse.urljoin(base, name)) for name in wanted]


def download_archive(name: str, url: str, target_dir: Path) -> ArchiveMeta:
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / name
    if not target.exists() or target.stat().st_size < 100:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=600) as response, target.open("wb") as output:  # noqa: S310
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
    if not zipfile.is_zipfile(target):
        raise RuntimeError(f"ZIP invalido: {target}")
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
        uf = row.get("microrregiao", {}).get("mesorregiao", {}).get("UF", {})
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
    args = parser.parse_args()

    started = datetime.now(timezone.utc)
    taxonomy = json.loads(args.taxonomy.read_text(encoding="utf-8"))
    competence = args.competence or (None if args.no_download else discover_latest_competence())
    source_dir = args.source_dir or (args.workdir / "raw" / (competence or "manual"))
    archive_meta: list[ArchiveMeta] = []
    if not args.no_download:
        if not competence:
            raise RuntimeError("Competencia CNPJ nao resolvida")
        for name, url in list_remote_archives(competence):
            archive_meta.append(download_archive(name, url, source_dir))

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
        "taxonomyVersion": taxonomy["version"],
        "taxonomyStatus": taxonomy.get("status"),
        "archives": [asdict(v) for v in archive_meta],
        "outputSha256": sha256_file(args.output),
        "stats": {**est_stats, **company_stats, **geo_stats},
        "transformations": ["situacao ativa 02", "CNAE principal+secundarios", "precedencia A>B>C", "porte e matriz/filial preservados", "join municipal por codigo IBGE", "agregacao municipal compacta"],
        "limitations": ["taxonomia v1 nao calibrada com ganhos/perdas Atlas", "porte nao promove tier sozinho", "capital social nao vira score", "frota/MDF-e/risco nao sao inferidos do CNPJ"]
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    if geo_stats["unmatched_geography_rows"]:
        print(f"AVISO: {geo_stats['unmatched_geography_rows']} estabelecimentos ICP sem match IBGE", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
