#!/usr/bin/env python3
"""Carga atômica de um snapshot CNPJ_COMPANIES no PostgreSQL via COPY.

O normalizador gera partições ``uf=XX/companies.csv.gz``. Este carregador usa um único processo
``psql``, uma tabela temporária e ``\\copy ... FROM PROGRAM 'gzip -dc ...'`` para evitar INSERT por
linha. Telefone, fax e e-mail entram apenas no staging efêmero e são deliberadamente omitidos da
tabela global MarketIntelligenceCompany.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qs, unquote, urlparse

COMPANY_COLUMNS = [
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
MAPPING_COLUMNS = [
    "receitaCode", "receitaName", "uf", "ibgeCode", "ibgeName", "mappingMethod",
    "sourceVersion",
]


def sql_literal(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest(snapshot_dir: Path) -> dict[str, Any]:
    path = snapshot_dir / "manifest.json"
    if not path.is_file():
        raise RuntimeError(f"manifest.json ausente em {snapshot_dir}")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("dataset") != "CNPJ_COMPANIES":
        raise RuntimeError("Snapshot não é CNPJ_COMPANIES")
    if not manifest.get("datasetHash") or not manifest.get("competencia"):
        raise RuntimeError("Manifest sem datasetHash/competencia")
    return manifest


def resolve_snapshot_files(snapshot_dir: Path, manifest: dict[str, Any]) -> tuple[list[Path], Path]:
    company_files: list[Path] = []
    expected_records = 0
    for entry in manifest.get("files") or []:
        rel = str(entry.get("path") or "")
        path = (snapshot_dir / rel).resolve()
        if snapshot_dir.resolve() not in path.parents:
            raise RuntimeError(f"Arquivo fora do snapshot: {rel}")
        if not path.is_file():
            raise RuntimeError(f"Partição ausente: {path}")
        if str(entry.get("sha256") or "") != sha256_file(path):
            raise RuntimeError(f"SHA-256 divergente: {path}")
        company_files.append(path)
        expected_records += int(entry.get("records") or 0)

    mapping_entry = manifest.get("municipalityMappingFile") or {}
    mapping_path = (snapshot_dir / str(mapping_entry.get("path") or "")).resolve()
    if snapshot_dir.resolve() not in mapping_path.parents or not mapping_path.is_file():
        raise RuntimeError("municipality-mapping.csv.gz ausente ou fora do snapshot")
    if str(mapping_entry.get("sha256") or "") != sha256_file(mapping_path):
        raise RuntimeError("SHA-256 divergente no municipality mapping")

    if not company_files:
        raise RuntimeError("Manifest não contém partições empresariais")
    exported = int((manifest.get("stats") or {}).get("recordsExported") or 0)
    if exported and exported != expected_records:
        raise RuntimeError(f"Manifest inconsistente: files={expected_records} stats.recordsExported={exported}")
    return company_files, mapping_path


def copy_from_gzip(table: str, columns: Iterable[str], path: Path) -> str:
    command = "gzip -dc " + shlex.quote(str(path))
    return (
        f"\\copy {table} ({', '.join(ident(column) for column in columns)}) "
        f"FROM PROGRAM {sql_literal(command)} WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');"
    )


def build_psql_script(snapshot_dir: Path, manifest: dict[str, Any]) -> str:
    company_files, mapping_path = resolve_snapshot_files(snapshot_dir, manifest)
    stats = manifest.get("stats") or {}
    rejections = manifest.get("rejections") or {}
    dataset_hash = str(manifest["datasetHash"])
    dataset_id = "mi_cnpj_" + dataset_hash[:24]
    competence = str(manifest["competencia"])
    source = str(manifest.get("source") or "RECEITA_FEDERAL_CNPJ")
    source_version = str(manifest.get("sourceVersion") or competence)
    source_url = manifest.get("sourceUrl")
    pipeline_version = str(manifest.get("pipelineVersion") or "unknown")
    records_read = int(stats.get("establishmentRowsRead") or 0)
    records_rejected = sum(int(value or 0) for value in rejections.values())
    expected_records = int(stats.get("recordsExported") or sum(int(item.get("records") or 0) for item in manifest.get("files") or []))
    compact_manifest = json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))

    company_stage_columns = ",\n  ".join(f"{ident(column)} TEXT" for column in COMPANY_COLUMNS)
    mapping_stage_columns = ",\n  ".join(f"{ident(column)} TEXT" for column in MAPPING_COLUMNS)
    copy_companies = "\n".join(copy_from_gzip("mi_company_stage", COMPANY_COLUMNS, path) for path in company_files)
    copy_mapping = copy_from_gzip("mi_mapping_stage", MAPPING_COLUMNS, mapping_path)

    return f"""\\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.bypass_rls', 'on', TRUE);
SELECT set_config('app.current_tenant_id', '', TRUE);

CREATE TEMP TABLE mi_company_stage (
  {company_stage_columns}
) ON COMMIT DROP;
CREATE TEMP TABLE mi_mapping_stage (
  {mapping_stage_columns}
) ON COMMIT DROP;

{copy_companies}
{copy_mapping}

DO $$
DECLARE
  actual_count BIGINT;
  distinct_count BIGINT;
  invalid_cnpj BIGINT;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT "cnpj") INTO actual_count, distinct_count FROM mi_company_stage;
  IF actual_count <> {expected_records} THEN
    RAISE EXCEPTION 'Snapshot empresarial: esperado %, recebido %', {expected_records}, actual_count;
  END IF;
  IF actual_count <> distinct_count THEN
    RAISE EXCEPTION 'Snapshot empresarial contém CNPJ duplicado: total %, distintos %', actual_count, distinct_count;
  END IF;
  SELECT COUNT(*) INTO invalid_cnpj FROM mi_company_stage WHERE "cnpj" !~ '^[A-Z0-9]{{12}}[0-9]{{2}}$';
  IF invalid_cnpj > 0 THEN
    RAISE EXCEPTION 'Snapshot empresarial contém % CNPJs fora do contrato alfanumérico', invalid_cnpj;
  END IF;
END $$;

INSERT INTO "MarketIntelligenceDataset" (
  "id", "dataset", "competencia", "source", "sourceVersion", "sourceUrl", "status",
  "startedAt", "recordsRead", "recordsImported", "recordsRejected", "recordsActive", "hash",
  "pipelineVersion", "outputManifest", "createdAt", "updatedAt"
) VALUES (
  {sql_literal(dataset_id)}, 'CNPJ_COMPANIES', {sql_literal(competence)}, {sql_literal(source)},
  {sql_literal(source_version)}, {sql_literal(str(source_url) if source_url else None)}, 'VALIDATING',
  NOW(), {records_read}, 0, {records_rejected}, 0, {sql_literal(dataset_hash)},
  {sql_literal(pipeline_version)}, {sql_literal(compact_manifest)}::jsonb, NOW(), NOW()
)
ON CONFLICT ("dataset", "competencia", "hash") DO UPDATE SET
  "source" = EXCLUDED."source",
  "sourceVersion" = EXCLUDED."sourceVersion",
  "sourceUrl" = EXCLUDED."sourceUrl",
  "status" = 'VALIDATING',
  "startedAt" = NOW(),
  "finishedAt" = NULL,
  "recordsRead" = EXCLUDED."recordsRead",
  "recordsRejected" = EXCLUDED."recordsRejected",
  "pipelineVersion" = EXCLUDED."pipelineVersion",
  "outputManifest" = EXCLUDED."outputManifest",
  "error" = NULL,
  "updatedAt" = NOW();

DELETE FROM "MarketIntelligenceCompany" WHERE "datasetId" = {sql_literal(dataset_id)};

INSERT INTO "MarketIntelligenceCompany" (
  "id", "datasetId", "cnpj", "cnpjBasico", "cnpjOrdem", "cnpjDv", "razaoSocial",
  "razaoSocialSearch", "nomeFantasia", "nomeFantasiaSearch", "matrizFilial",
  "situacaoCadastralCodigo", "situacaoCadastral", "dataSituacaoCadastral",
  "motivoSituacaoCodigo", "motivoSituacaoCadastral", "dataInicioAtividade", "cnaePrincipal",
  "cnaePrincipalDescricao", "cnaesSecundarios", "naturezaJuridicaCodigo", "naturezaJuridica",
  "porteCodigo", "porte", "capitalSocial", "qualificacaoResponsavelCodigo",
  "qualificacaoResponsavel", "enteFederativoResponsavel", "opcaoSimples", "dataOpcaoSimples",
  "dataExclusaoSimples", "opcaoMei", "dataOpcaoMei", "dataExclusaoMei", "tipoLogradouro",
  "logradouro", "numero", "complemento", "bairro", "cep", "municipioCodigoReceita",
  "municipioIbge", "municipioNome", "uf", "icpTier", "icpScore", "icpReasons",
  "icpTaxonomyVersion", "icpCalculatedAt", "dataOrigin", "competencia", "importedAt"
)
SELECT
  'mic_' || substr(md5({sql_literal(dataset_id)} || ':' || "cnpj"), 1, 28),
  {sql_literal(dataset_id)}, "cnpj", "cnpjBasico", "cnpjOrdem", "cnpjDv", "razaoSocial",
  "razaoSocialSearch", NULLIF("nomeFantasia", ''), NULLIF("nomeFantasiaSearch", ''),
  NULLIF("matrizFilial", ''), NULLIF("situacaoCadastralCodigo", ''), NULLIF("situacaoCadastral", ''),
  NULLIF("dataSituacaoCadastral", '')::date, NULLIF("motivoSituacaoCodigo", ''),
  NULLIF("motivoSituacaoCadastral", ''), NULLIF("dataInicioAtividade", '')::date,
  NULLIF("cnaePrincipal", ''), NULLIF("cnaePrincipalDescricao", ''),
  NULLIF("cnaesSecundarios", '')::jsonb, NULLIF("naturezaJuridicaCodigo", ''),
  NULLIF("naturezaJuridica", ''), NULLIF("porteCodigo", ''), NULLIF("porte", ''),
  NULLIF("capitalSocial", '')::numeric(20,2), NULLIF("qualificacaoResponsavelCodigo", ''),
  NULLIF("qualificacaoResponsavel", ''), NULLIF("enteFederativoResponsavel", ''),
  NULLIF("opcaoSimples", ''), NULLIF("dataOpcaoSimples", '')::date,
  NULLIF("dataExclusaoSimples", '')::date, NULLIF("opcaoMei", ''),
  NULLIF("dataOpcaoMei", '')::date, NULLIF("dataExclusaoMei", '')::date,
  NULLIF("tipoLogradouro", ''), NULLIF("logradouro", ''), NULLIF("numero", ''),
  NULLIF("complemento", ''), NULLIF("bairro", ''), NULLIF("cep", ''),
  NULLIF("municipioCodigoReceita", ''), NULLIF("municipioIbge", ''), NULLIF("municipioNome", ''),
  NULLIF("uf", ''), NULLIF("icpTier", '')::"MarketIntelligenceIcpTier",
  NULLIF("icpScore", '')::integer, NULLIF("icpReasons", '')::jsonb,
  NULLIF("icpTaxonomyVersion", ''), NULLIF("icpCalculatedAt", '')::timestamp,
  COALESCE(NULLIF("dataOrigin", ''), 'OBSERVED')::"MarketIntelligenceDataOrigin",
  "competencia", NOW()
FROM mi_company_stage;

-- RNTRC individual não é derivado do agregado municipal. Os campos individuais permanecem NULL.
-- Telefone/fax/e-mail também permanecem NULL por força do guardrail do catálogo global.

INSERT INTO "MarketIntelligenceMunicipalityMapping" (
  "id", "receitaCode", "receitaName", "uf", "ibgeCode", "ibgeName", "mappingMethod",
  "sourceVersion", "importedAt"
)
SELECT
  'mim_' || substr(md5("receitaCode"), 1, 28), "receitaCode", "receitaName", "uf",
  "ibgeCode", "ibgeName", "mappingMethod", "sourceVersion", NOW()
FROM mi_mapping_stage
ON CONFLICT ("receitaCode") DO UPDATE SET
  "receitaName" = EXCLUDED."receitaName",
  "uf" = EXCLUDED."uf",
  "ibgeCode" = EXCLUDED."ibgeCode",
  "ibgeName" = EXCLUDED."ibgeName",
  "mappingMethod" = EXCLUDED."mappingMethod",
  "sourceVersion" = EXCLUDED."sourceVersion",
  "importedAt" = NOW();

DO $$
DECLARE
  imported_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO imported_count
  FROM "MarketIntelligenceCompany" WHERE "datasetId" = {sql_literal(dataset_id)};
  IF imported_count <> {expected_records} THEN
    RAISE EXCEPTION 'Carga empresarial: esperado %, persistido %', {expected_records}, imported_count;
  END IF;
END $$;

UPDATE "MarketIntelligenceDataset"
SET "publicationSlot" = NULL,
    "status" = CASE WHEN "status" = 'READY' THEN 'ARCHIVED'::"MarketIntelligenceDatasetStatus" ELSE "status" END,
    "updatedAt" = NOW()
WHERE "publicationSlot" = 'CNPJ_ACTIVE' AND "id" <> {sql_literal(dataset_id)};

UPDATE "MarketIntelligenceDataset"
SET "status" = 'READY',
    "publicationSlot" = 'CNPJ_ACTIVE',
    "recordsImported" = (SELECT COUNT(*) FROM "MarketIntelligenceCompany" WHERE "datasetId" = {sql_literal(dataset_id)}),
    "recordsActive" = (SELECT COUNT(*) FROM "MarketIntelligenceCompany" WHERE "datasetId" = {sql_literal(dataset_id)} AND "situacaoCadastral" = 'ATIVA'),
    "finishedAt" = NOW(),
    "activatedAt" = NOW(),
    "updatedAt" = NOW()
WHERE "id" = {sql_literal(dataset_id)};

COMMIT;
"""


def libpq_env(database_url: str) -> dict[str, str]:
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise RuntimeError("DATABASE_URL deve usar postgres:// ou postgresql://")
    if not parsed.hostname or not parsed.path.strip("/"):
        raise RuntimeError("DATABASE_URL incompleta")
    env = dict(os.environ)
    env.update({
        "PGHOST": parsed.hostname,
        "PGPORT": str(parsed.port or 5432),
        "PGDATABASE": unquote(parsed.path.strip("/")),
        "PGUSER": unquote(parsed.username or ""),
        "PGPASSWORD": unquote(parsed.password or ""),
    })
    query = parse_qs(parsed.query)
    if query.get("sslmode"):
        env["PGSSLMODE"] = query["sslmode"][0]
    return env


def main() -> int:
    parser = argparse.ArgumentParser(description="Publica snapshot CNPJ empresarial via COPY atômico")
    parser.add_argument("snapshot_dir", type=Path)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--psql", default="psql")
    parser.add_argument("--dry-run", action="store_true", help="Valida arquivos e gera SQL, sem conectar ao banco")
    parser.add_argument("--keep-sql", type=Path, help="Salva uma cópia do SQL operacional para auditoria")
    args = parser.parse_args()

    snapshot_dir = args.snapshot_dir.resolve()
    manifest = load_manifest(snapshot_dir)
    sql = build_psql_script(snapshot_dir, manifest)
    if args.keep_sql:
        args.keep_sql.write_text(sql, encoding="utf-8")
    if args.dry_run:
        print(json.dumps({
            "ok": True,
            "dataset": manifest["dataset"],
            "competencia": manifest["competencia"],
            "datasetHash": manifest["datasetHash"],
            "records": int((manifest.get("stats") or {}).get("recordsExported") or 0),
            "mode": "dry-run",
        }, ensure_ascii=False))
        return 0

    if not args.database_url:
        raise RuntimeError("DATABASE_URL não definida")
    psql = shutil.which(args.psql)
    if not psql:
        raise RuntimeError("psql não encontrado no PATH")

    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".sql", delete=False) as handle:
        handle.write(sql)
        sql_path = Path(handle.name)
    try:
        subprocess.run(
            [psql, "-X", "-v", "ON_ERROR_STOP=1", "-f", str(sql_path)],
            env=libpq_env(args.database_url),
            check=True,
        )
    finally:
        sql_path.unlink(missing_ok=True)

    print(json.dumps({
        "ok": True,
        "dataset": manifest["dataset"],
        "competencia": manifest["competencia"],
        "datasetHash": manifest["datasetHash"],
        "publicationSlot": "CNPJ_ACTIVE",
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
