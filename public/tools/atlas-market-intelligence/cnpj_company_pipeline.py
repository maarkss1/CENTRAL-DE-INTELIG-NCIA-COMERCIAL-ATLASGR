#!/usr/bin/env python3
"""Normalização empresarial detalhada do snapshot oficial de CNPJ.

O módulo usa apenas biblioteca padrão, ZIP streaming e SQLite em disco. Para uma amostra
territorial, guarda somente os estabelecimentos do filtro antes de ler Empresas/Simples. Para a
carga nacional, materializa Empresas/Simples em SQLite e transforma Estabelecimentos em lotes,
sem carregar a base inteira em RAM.
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import json
import os
import re
import shutil
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from contextlib import ExitStack
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator, Sequence

PIPELINE_VERSION = "market-intelligence-companies-v2"
SOURCE = "RECEITA_FEDERAL_CNPJ"

COMPANY_EXPORT_COLUMNS = [
    "cnpj", "cnpjBasico", "cnpjOrdem", "cnpjDv", "razaoSocial", "razaoSocialSearch",
    "nomeFantasia", "nomeFantasiaSearch", "matrizFilial", "situacaoCadastralCodigo",
    "situacaoCadastral", "dataSituacaoCadastral", "motivoSituacaoCodigo",
    "motivoSituacaoCadastral", "dataInicioAtividade", "cnaePrincipal",
    "cnaePrincipalDescricao", "cnaesSecundarios", "naturezaJuridicaCodigo",
    "naturezaJuridica", "porteCodigo", "porte", "capitalSocial",
    "qualificacaoResponsavelCodigo", "qualificacaoResponsavel",
    "enteFederativoResponsavel", "opcaoSimples", "dataOpcaoSimples",
    "dataExclusaoSimples", "opcaoMei", "dataOpcaoMei", "dataExclusaoMei",
    "tipoLogradouro", "logradouro", "numero", "complemento", "bairro", "cep",
    "municipioCodigoReceita", "municipioIbge", "municipioNome", "uf", "ddd1",
    "telefone1", "ddd2", "telefone2", "dddFax", "fax", "email", "icpTier",
    "icpScore", "icpReasons", "icpTaxonomyVersion", "icpCalculatedAt", "hasRntrc",
    "rntrcStatus", "rntrcType", "rntrcNumber", "rntrcSource", "rntrcUpdatedAt",
    "dataOrigin", "competencia",
]

MAPPING_EXPORT_COLUMNS = [
    "receitaCode", "receitaName", "uf", "ibgeCode", "ibgeName", "mappingMethod",
    "sourceVersion",
]

SITUATION = {
    "01": "NULA",
    "02": "ATIVA",
    "03": "SUSPENSA",
    "04": "INAPTA",
    "08": "BAIXADA",
}
MATRIX_BRANCH = {"1": "MATRIZ", "2": "FILIAL"}
COMPANY_SIZE = {
    "00": "NAO_INFORMADO",
    "01": "MICROEMPRESA",
    "03": "EMPRESA_DE_PEQUENO_PORTE",
    "05": "DEMAIS",
}


@dataclass(frozen=True)
class SnapshotFile:
    path: str
    sha256: str
    records: int
    uf: str | None = None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_search(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", re.sub(r"[^A-Za-z0-9]+", " ", text).upper()).strip()


def normalize_code(value: str | None) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", value or "").upper()


def normalize_cnae(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def normalize_date(value: str | None) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) != 8 or digits == "00000000":
        return ""
    try:
        return datetime.strptime(digits, "%Y%m%d").date().isoformat()
    except ValueError:
        return ""


def normalize_decimal(value: str | None) -> str:
    candidate = (value or "").strip().replace(".", "").replace(",", ".")
    if not candidate:
        return ""
    try:
        return f"{max(0.0, float(candidate)):.2f}"
    except ValueError:
        return ""


def tristate(value: str | None) -> str:
    normalized = (value or "").strip().upper()
    if normalized == "S":
        return "SIM"
    if normalized == "N":
        return "NAO"
    return "NAO_INFORMADO"


def split_secondary_cnaes(value: str | None, descriptions: dict[str, str]) -> list[dict[str, str | None]]:
    seen: set[str] = set()
    result: list[dict[str, str | None]] = []
    for raw in re.split(r"[,;]", value or ""):
        code = normalize_cnae(raw)
        if not code or code in seen:
            continue
        seen.add(code)
        result.append({"code": code, "description": descriptions.get(code)})
    return result


def zip_rows(path: Path) -> Iterator[list[str]]:
    import io
    import zipfile

    with zipfile.ZipFile(path) as archive:
        members = [item for item in archive.infolist() if not item.is_dir()]
        if not members:
            return
        member = max(members, key=lambda item: item.file_size)
        with archive.open(member) as raw:
            stream = io.TextIOWrapper(raw, encoding="latin-1", errors="replace", newline="")
            yield from csv.reader(stream, delimiter=";", quotechar='"')


def load_code_table(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for row in zip_rows(path):
        if len(row) >= 2 and row[0].strip():
            result[row[0].strip()] = row[1].strip()
    if not result:
        raise RuntimeError(f"Tabela de referencia vazia: {path}")
    return result


def build_ibge_lookup(rows: Sequence[dict[str, Any]]) -> dict[tuple[str, str], dict[str, str]]:
    result: dict[tuple[str, str], dict[str, str]] = {}
    collisions: set[tuple[str, str]] = set()
    for row in rows:
        uf = ((row.get("microrregiao") or {}).get("mesorregiao") or {}).get("UF") or {}
        if not uf:
            immediate = row.get("regiao-imediata") or {}
            uf = ((immediate.get("regiao-intermediaria") or {}).get("UF")) or {}
        sigla = str(uf.get("sigla") or "").upper()
        name = str(row.get("nome") or "")
        key = (sigla, normalize_search(name))
        if not sigla or not name:
            continue
        if key in result and result[key]["ibgeCode"] != str(row["id"]):
            collisions.add(key)
        result[key] = {"ibgeCode": str(row["id"]), "ibgeName": name, "uf": sigla}
    if collisions:
        raise RuntimeError(f"IBGE contem nomes municipais ambiguos na mesma UF: {sorted(collisions)[:5]}")
    return result


def calculate_dataset_hash(
    competence: str,
    archives: Iterable[Path],
    filter_uf: str | None,
    filter_ibge: str | None,
) -> str:
    inputs = [{"name": path.name, "size": path.stat().st_size, "sha256": sha256_file(path)} for path in sorted(archives)]
    canonical = json.dumps(
        {
            "pipelineVersion": PIPELINE_VERSION,
            "competence": competence,
            "filterUf": filter_uf,
            "filterMunicipioIbge": filter_ibge,
            "inputs": inputs,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def create_company_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=NORMAL")
    db.execute("PRAGMA temp_store=FILE")
    db.executescript(
        """
        DROP TABLE IF EXISTS company_info;
        DROP TABLE IF EXISTS selected_establishment;
        CREATE TABLE company_info (
          cnpj_basic TEXT PRIMARY KEY,
          legal_name TEXT NOT NULL,
          legal_nature_code TEXT,
          responsible_qualification_code TEXT,
          capital_social TEXT,
          company_size_code TEXT,
          federative_entity TEXT,
          simples TEXT,
          simples_start TEXT,
          simples_end TEXT,
          mei TEXT,
          mei_start TEXT,
          mei_end TEXT
        ) WITHOUT ROWID;
        CREATE TABLE selected_establishment (
          cnpj_basic TEXT NOT NULL,
          cnpj_order TEXT NOT NULL,
          cnpj_dv TEXT NOT NULL,
          matrix_branch TEXT,
          trade_name TEXT,
          registration_status TEXT,
          registration_status_date TEXT,
          registration_status_reason TEXT,
          activity_start_date TEXT,
          primary_cnae TEXT,
          secondary_cnaes TEXT,
          street_type TEXT,
          street TEXT,
          street_number TEXT,
          address_extra TEXT,
          neighborhood TEXT,
          postal_code TEXT,
          uf TEXT,
          receita_municipality_code TEXT,
          ddd1 TEXT,
          phone1 TEXT,
          ddd2 TEXT,
          phone2 TEXT,
          fax_ddd TEXT,
          fax TEXT,
          email TEXT,
          ibge_code TEXT,
          municipality_name TEXT,
          PRIMARY KEY (cnpj_basic, cnpj_order, cnpj_dv)
        ) WITHOUT ROWID;
        CREATE INDEX idx_selected_establishment_basic ON selected_establishment(cnpj_basic);
        """
    )
    return db


def insert_company_rows(
    db: sqlite3.Connection,
    archives: Sequence[Path],
    selected_basics: set[str] | None,
    progress: Callable[[str], None],
) -> Counter[str]:
    stats: Counter[str] = Counter()
    sql = "INSERT OR REPLACE INTO company_info VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
    batch: list[tuple[str, ...]] = []
    for archive in archives:
        progress(f"EMPRESAS arquivo={archive.name}")
        for row in zip_rows(archive):
            stats["companyRowsRead"] += 1
            if len(row) < 7:
                stats["companyRowsRejected"] += 1
                continue
            basic = normalize_code(row[0])
            if selected_basics is not None and basic not in selected_basics:
                continue
            if not basic or not row[1].strip():
                stats["companyRowsRejected"] += 1
                continue
            batch.append((
                basic, row[1].strip(), row[2].strip(), row[3].strip(), normalize_decimal(row[4]),
                row[5].strip().zfill(2), row[6].strip(), "NAO_INFORMADO", "", "",
                "NAO_INFORMADO", "", "",
            ))
            if len(batch) >= 10_000:
                db.executemany(sql, batch)
                db.commit()
                stats["companyRowsLoaded"] += len(batch)
                batch.clear()
    if batch:
        db.executemany(sql, batch)
        db.commit()
        stats["companyRowsLoaded"] += len(batch)
    return stats


def update_simples_rows(
    db: sqlite3.Connection,
    archive: Path,
    selected_basics: set[str] | None,
    progress: Callable[[str], None],
) -> Counter[str]:
    stats: Counter[str] = Counter()
    progress(f"SIMPLES arquivo={archive.name}")
    sql = """
      UPDATE company_info SET simples=?, simples_start=?, simples_end=?, mei=?, mei_start=?, mei_end=?
      WHERE cnpj_basic=?
    """
    batch: list[tuple[str, ...]] = []
    for row in zip_rows(archive):
        stats["simplesRowsRead"] += 1
        if len(row) < 7:
            stats["simplesRowsRejected"] += 1
            continue
        basic = normalize_code(row[0])
        if selected_basics is not None and basic not in selected_basics:
            continue
        batch.append((
            tristate(row[1]), normalize_date(row[2]), normalize_date(row[3]), tristate(row[4]),
            normalize_date(row[5]), normalize_date(row[6]), basic,
        ))
        if len(batch) >= 10_000:
            cursor = db.executemany(sql, batch)
            db.commit()
            stats["simplesRowsMatched"] += max(cursor.rowcount, 0)
            batch.clear()
    if batch:
        cursor = db.executemany(sql, batch)
        db.commit()
        stats["simplesRowsMatched"] += max(cursor.rowcount, 0)
    return stats


def establishment_tuple(row: Sequence[str], geo: dict[str, str]) -> tuple[str, ...]:
    padded = list(row) + [""] * max(0, 30 - len(row))
    return (
        normalize_code(padded[0]), normalize_code(padded[1]), normalize_code(padded[2]),
        padded[3].strip(), padded[4].strip(), padded[5].strip().zfill(2), padded[6].strip(),
        padded[7].strip(), padded[10].strip(), padded[11].strip(), padded[12].strip(),
        padded[13].strip(), padded[14].strip(), padded[15].strip(), padded[16].strip(),
        padded[17].strip(), padded[18].strip(), padded[19].strip().upper(), padded[20].strip(),
        padded[21].strip(), padded[22].strip(), padded[23].strip(), padded[24].strip(),
        padded[25].strip(), padded[26].strip(), padded[27].strip(), geo["ibgeCode"],
        geo["ibgeName"],
    )


def resolve_geo(
    row: Sequence[str],
    receita_municipalities: dict[str, str],
    ibge: dict[tuple[str, str], dict[str, str]],
) -> dict[str, str] | None:
    if len(row) < 21:
        return None
    uf, receita_code = row[19].strip().upper(), row[20].strip()
    receita_name = receita_municipalities.get(receita_code)
    if not receita_name:
        return None
    return ibge.get((uf, normalize_search(receita_name)))


def scan_selected_establishments(
    db: sqlite3.Connection,
    archives: Sequence[Path],
    receita_municipalities: dict[str, str],
    ibge: dict[tuple[str, str], dict[str, str]],
    filter_uf: str | None,
    filter_ibge: str | None,
    observed_mappings: dict[str, dict[str, str]],
    progress: Callable[[str], None],
) -> Counter[str]:
    stats: Counter[str] = Counter()
    sql = "INSERT OR REPLACE INTO selected_establishment VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    batch: list[tuple[str, ...]] = []
    for archive in archives:
        progress(f"ESTABELECIMENTOS filtro arquivo={archive.name}")
        for row in zip_rows(archive):
            stats["establishmentRowsRead"] += 1
            geo = resolve_geo(row, receita_municipalities, ibge)
            if not geo:
                stats["unmatchedGeographyRows"] += 1
                continue
            receita_code = row[20].strip()
            observed_mappings[receita_code] = {
                "receitaCode": receita_code,
                "receitaName": receita_municipalities[receita_code],
                "uf": row[19].strip().upper(),
                **geo,
            }
            if filter_uf and row[19].strip().upper() != filter_uf:
                continue
            if filter_ibge and geo["ibgeCode"] != filter_ibge:
                continue
            if len(row) < 28:
                stats["establishmentRowsRejected"] += 1
                continue
            batch.append(establishment_tuple(row, geo))
            if len(batch) >= 10_000:
                db.executemany(sql, batch)
                db.commit()
                stats["establishmentRowsSelected"] += len(batch)
                batch.clear()
    if batch:
        db.executemany(sql, batch)
        db.commit()
        stats["establishmentRowsSelected"] += len(batch)
    return stats


def joined_company_row(
    establishment: Sequence[str],
    company: Sequence[str],
    lookups: dict[str, dict[str, str]],
    competence: str,
) -> list[str]:
    (
        basic, order, dv, matrix, trade_name, status_code, status_date, reason_code,
        activity_start, primary_cnae_raw, secondary_cnaes_raw, street_type, street, number,
        extra, neighborhood, postal_code, uf, receita_code, ddd1, phone1, ddd2, phone2,
        fax_ddd, fax, email, ibge_code, municipality_name,
    ) = establishment
    (
        legal_name, nature_code, qualification_code, capital, size_code, federative_entity,
        simples, simples_start, simples_end, mei, mei_start, mei_end,
    ) = company
    cnpj = normalize_code(f"{basic}{order}{dv}")
    primary_cnae = normalize_cnae(primary_cnae_raw)
    secondary = split_secondary_cnaes(secondary_cnaes_raw, lookups["cnaes"])
    return [
        cnpj, basic, order, dv, legal_name, normalize_search(legal_name), trade_name,
        normalize_search(trade_name), MATRIX_BRANCH.get(matrix, matrix or ""), status_code,
        SITUATION.get(status_code, f"CODIGO_{status_code}" if status_code else ""),
        normalize_date(status_date), reason_code, lookups["motivos"].get(reason_code, ""),
        normalize_date(activity_start), primary_cnae, lookups["cnaes"].get(primary_cnae, ""),
        json.dumps(secondary, ensure_ascii=False, separators=(",", ":")), nature_code,
        lookups["naturezas"].get(nature_code, ""), size_code, COMPANY_SIZE.get(size_code, "NAO_INFORMADO"),
        capital, qualification_code, lookups["qualificacoes"].get(qualification_code, ""),
        federative_entity, simples, simples_start, simples_end, mei, mei_start, mei_end,
        street_type, street, number, extra, neighborhood, re.sub(r"\D", "", postal_code),
        receita_code, ibge_code, municipality_name, uf, ddd1, phone1, ddd2, phone2, fax_ddd,
        fax, email.lower(),
        "", "", "", "", "",  # ICP ainda não calculado: infraestrutura pronta, sem tier inventado.
        "", "", "", "", "", "",  # RNTRC empresarial indisponível: não derivar do agregado municipal.
        "OBSERVED", competence,
    ]


class PartitionedCsvWriter:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.stack = ExitStack()
        self.writers: dict[str, csv.writer] = {}
        self.paths: dict[str, Path] = {}
        self.counts: Counter[str] = Counter()

    def write(self, uf: str, row: Sequence[str]) -> None:
        key = uf or "SEM_UF"
        if key not in self.writers:
            directory = self.root / f"uf={key}"
            directory.mkdir(parents=True, exist_ok=True)
            path = directory / "companies.csv.gz"
            handle = self.stack.enter_context(gzip.open(path, "wt", encoding="utf-8", newline="", compresslevel=6))
            writer = csv.writer(handle, lineterminator="\n")
            writer.writerow(COMPANY_EXPORT_COLUMNS)
            self.writers[key] = writer
            self.paths[key] = path
        self.writers[key].writerow(row)
        self.counts[key] += 1

    def close(self) -> list[SnapshotFile]:
        self.stack.close()
        return [
            SnapshotFile(str(self.paths[key].relative_to(self.root)), sha256_file(self.paths[key]), self.counts[key], key)
            for key in sorted(self.paths)
        ]


def export_selected(
    db: sqlite3.Connection,
    writer: PartitionedCsvWriter,
    lookups: dict[str, dict[str, str]],
    competence: str,
) -> Counter[str]:
    stats: Counter[str] = Counter()
    query = """
      SELECT e.*, c.legal_name, c.legal_nature_code, c.responsible_qualification_code,
             c.capital_social, c.company_size_code, c.federative_entity, c.simples,
             c.simples_start, c.simples_end, c.mei, c.mei_start, c.mei_end
      FROM selected_establishment e
      LEFT JOIN company_info c ON c.cnpj_basic=e.cnpj_basic
      ORDER BY e.uf, e.cnpj_basic, e.cnpj_order, e.cnpj_dv
    """
    for row in db.execute(query):
        establishment, company = row[:28], row[28:]
        if not company[0]:
            stats["missingCompanyRows"] += 1
            continue
        exported = joined_company_row(establishment, company, lookups, competence)
        writer.write(str(establishment[17]), exported)
        stats["recordsExported"] += 1
        if exported[10] == "ATIVA":
            stats["activeRecordsExported"] += 1
        if exported[15]:
            stats["recordsWithCnae"] += 1
        if exported[38] and exported[39]:
            stats["recordsWithIbge"] += 1
    return stats


def export_national(
    db: sqlite3.Connection,
    archives: Sequence[Path],
    receita_municipalities: dict[str, str],
    ibge: dict[tuple[str, str], dict[str, str]],
    lookups: dict[str, dict[str, str]],
    competence: str,
    chunk_size: int,
    observed_mappings: dict[str, dict[str, str]],
    writer: PartitionedCsvWriter,
    progress: Callable[[str], None],
) -> Counter[str]:
    stats: Counter[str] = Counter()
    db.execute("DROP TABLE IF EXISTS establishment_batch")
    db.execute("CREATE TEMP TABLE establishment_batch AS SELECT * FROM selected_establishment WHERE 0")
    insert_sql = "INSERT INTO establishment_batch VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"

    def flush(batch: list[tuple[str, ...]]) -> None:
        if not batch:
            return
        db.executemany(insert_sql, batch)
        query = """
          SELECT e.*, c.legal_name, c.legal_nature_code, c.responsible_qualification_code,
                 c.capital_social, c.company_size_code, c.federative_entity, c.simples,
                 c.simples_start, c.simples_end, c.mei, c.mei_start, c.mei_end
          FROM establishment_batch e
          LEFT JOIN company_info c ON c.cnpj_basic=e.cnpj_basic
        """
        for joined in db.execute(query):
            establishment, company = joined[:28], joined[28:]
            if not company[0]:
                stats["missingCompanyRows"] += 1
                continue
            exported = joined_company_row(establishment, company, lookups, competence)
            writer.write(str(establishment[17]), exported)
            stats["recordsExported"] += 1
            if exported[10] == "ATIVA":
                stats["activeRecordsExported"] += 1
            if exported[15]:
                stats["recordsWithCnae"] += 1
            if exported[38] and exported[39]:
                stats["recordsWithIbge"] += 1
        db.execute("DELETE FROM establishment_batch")
        batch.clear()

    batch: list[tuple[str, ...]] = []
    for archive in archives:
        progress(f"ESTABELECIMENTOS nacional arquivo={archive.name}")
        for row in zip_rows(archive):
            stats["establishmentRowsRead"] += 1
            if len(row) < 28:
                stats["establishmentRowsRejected"] += 1
                continue
            geo = resolve_geo(row, receita_municipalities, ibge)
            if not geo:
                stats["unmatchedGeographyRows"] += 1
                continue
            receita_code = row[20].strip()
            observed_mappings[receita_code] = {
                "receitaCode": receita_code,
                "receitaName": receita_municipalities[receita_code],
                "uf": row[19].strip().upper(),
                **geo,
            }
            batch.append(establishment_tuple(row, geo))
            if len(batch) >= chunk_size:
                flush(batch)
    flush(batch)
    return stats


def write_mapping_file(
    root: Path,
    mappings: dict[str, dict[str, str]],
    competence: str,
) -> SnapshotFile:
    path = root / "municipality-mapping.csv.gz"
    with gzip.open(path, "wt", encoding="utf-8", newline="", compresslevel=6) as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(MAPPING_EXPORT_COLUMNS)
        for code in sorted(mappings):
            row = mappings[code]
            writer.writerow([
                row["receitaCode"], row["receitaName"], row["uf"], row["ibgeCode"],
                row["ibgeName"], "RECEITA_NAME_UF_TO_IBGE_OFFICIAL", competence,
            ])
    return SnapshotFile(str(path.relative_to(root)), sha256_file(path), len(mappings))


def build_company_snapshot(
    *,
    competence: str,
    workdir: Path,
    output_root: Path,
    establishment_archives: Sequence[Path],
    company_archives: Sequence[Path],
    simples_archive: Path,
    municipalities_archive: Path,
    cnaes_archive: Path,
    naturezas_archive: Path,
    qualificacoes_archive: Path,
    motivos_archive: Path,
    ibge_rows: Sequence[dict[str, Any]],
    source_url: str,
    filter_uf: str | None = None,
    filter_ibge: str | None = None,
    chunk_size: int = 10_000,
    progress: Callable[[str], None] = print,
) -> dict[str, Any]:
    if not re.fullmatch(r"20\d{2}-(?:0[1-9]|1[0-2])", competence):
        raise ValueError("competence deve usar YYYY-MM")
    normalized_uf = filter_uf.upper() if filter_uf else None
    if normalized_uf and not re.fullmatch(r"[A-Z]{2}", normalized_uf):
        raise ValueError("filter_uf invalida")
    if filter_ibge and not re.fullmatch(r"\d{7}", filter_ibge):
        raise ValueError("filter_ibge deve conter 7 digitos")
    if chunk_size < 100 or chunk_size > 100_000:
        raise ValueError("chunk_size deve ficar entre 100 e 100000")

    archives = [
        *establishment_archives, *company_archives, simples_archive, municipalities_archive,
        cnaes_archive, naturezas_archive, qualificacoes_archive, motivos_archive,
    ]
    dataset_hash = calculate_dataset_hash(competence, archives, normalized_uf, filter_ibge)
    snapshot_dir = output_root / f"competencia={competence}" / f"snapshot={dataset_hash[:16]}"
    manifest_path = snapshot_dir / "manifest.json"
    if manifest_path.exists():
        existing = json.loads(manifest_path.read_text(encoding="utf-8"))
        if existing.get("datasetHash") == dataset_hash:
            progress(f"IDEMPOTENTE snapshot existente={snapshot_dir}")
            return existing

    temp_dir = snapshot_dir.parent / f".tmp-{dataset_hash[:16]}-{os.getpid()}"
    if temp_dir.exists():
        resolved = temp_dir.resolve()
        if resolved.parent != snapshot_dir.parent.resolve() or not resolved.name.startswith(".tmp-"):
            raise RuntimeError(f"Diretorio temporario inseguro: {resolved}")
        shutil.rmtree(resolved)
    temp_dir.mkdir(parents=True, exist_ok=False)

    started = datetime.now(timezone.utc)
    receita_municipalities = load_code_table(municipalities_archive)
    ibge = build_ibge_lookup(ibge_rows)
    lookups = {
        "cnaes": load_code_table(cnaes_archive),
        "naturezas": load_code_table(naturezas_archive),
        "qualificacoes": load_code_table(qualificacoes_archive),
        "motivos": load_code_table(motivos_archive),
    }
    observed_mappings: dict[str, dict[str, str]] = {}
    stats: Counter[str] = Counter()
    db_path = workdir / "work" / f"companies-{dataset_hash[:16]}.sqlite"
    db = create_company_db(db_path)
    writer = PartitionedCsvWriter(temp_dir)
    try:
        selected_basics: set[str] | None = None
        if normalized_uf or filter_ibge:
            stats.update(scan_selected_establishments(
                db, establishment_archives, receita_municipalities, ibge, normalized_uf,
                filter_ibge, observed_mappings, progress,
            ))
            selected_basics = {row[0] for row in db.execute("SELECT DISTINCT cnpj_basic FROM selected_establishment")}
            if not selected_basics:
                raise RuntimeError("Filtro territorial nao encontrou estabelecimentos no snapshot")
        stats.update(insert_company_rows(db, company_archives, selected_basics, progress))
        stats.update(update_simples_rows(db, simples_archive, selected_basics, progress))
        if selected_basics is not None:
            stats.update(export_selected(db, writer, lookups, competence))
        else:
            stats.update(export_national(
                db, establishment_archives, receita_municipalities, ibge, lookups, competence,
                chunk_size, observed_mappings, writer, progress,
            ))
        files = writer.close()
        mapping_file = write_mapping_file(temp_dir, observed_mappings, competence)
    except Exception:
        writer.stack.close()
        raise
    finally:
        db.close()

    if stats["recordsExported"] <= 0:
        raise RuntimeError("Snapshot empresarial detalhado ficou vazio")
    if stats["missingCompanyRows"]:
        raise RuntimeError(f"Snapshot possui {stats['missingCompanyRows']} estabelecimentos sem Empresa correspondente")

    finished = datetime.now(timezone.utc)
    manifest: dict[str, Any] = {
        "dataset": "CNPJ_COMPANIES",
        "source": SOURCE,
        "sourceVersion": competence,
        "sourceUrl": source_url,
        "competencia": competence,
        "pipelineVersion": PIPELINE_VERSION,
        "datasetHash": dataset_hash,
        "generatedAt": finished.isoformat(),
        "durationSeconds": round((finished - started).total_seconds(), 3),
        "filters": {"uf": normalized_uf, "municipioIbge": filter_ibge},
        "files": [file.__dict__ for file in files],
        "municipalityMappingFile": mapping_file.__dict__,
        "stats": dict(stats),
        "semantics": {
            "receitaFields": "OBSERVED",
            "icp": "NOT_AVAILABLE",
            "rntrcCompany": "NOT_AVAILABLE",
            "publicContact": "DADO_CADASTRAL_PUBLICO_NAO_VALIDADO",
        },
        "rejections": {
            "establishmentRowsRejected": stats["establishmentRowsRejected"],
            "companyRowsRejected": stats["companyRowsRejected"],
            "simplesRowsRejected": stats["simplesRowsRejected"],
            "unmatchedGeographyRows": stats["unmatchedGeographyRows"],
        },
    }
    (temp_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    snapshot_dir.parent.mkdir(parents=True, exist_ok=True)
    temp_dir.replace(snapshot_dir)
    progress(json.dumps({
        "snapshot": str(snapshot_dir),
        "competencia": competence,
        "recordsRead": stats["establishmentRowsRead"],
        "recordsImported": stats["recordsExported"],
        "recordsRejected": sum(manifest["rejections"].values()),
        "durationSeconds": manifest["durationSeconds"],
    }, ensure_ascii=False))
    return manifest
