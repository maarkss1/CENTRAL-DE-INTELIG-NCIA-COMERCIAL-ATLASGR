#!/usr/bin/env python3
"""Bulk import e publicação atômica de um snapshot empresarial do Market Intelligence.

Requer o cliente `psql` e DATABASE_URL/DIRECT_URL. Cada arquivo gzip é descompactado para um
arquivo temporário, carregado por `COPY` em uma tabela TEMP e movido por `INSERT ... SELECT` para
o dataset PROCESSING. A API só enxerga a linha cujo publicationSlot é CNPJ_ACTIVE.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Sequence

COMPANY_COLUMNS = [
    "cnpj", "cnpjBasico", "cnpjOrdem", "cnpjDv", "razaoSocial", "razaoSocialSearch",
    "nomeFantasia", "nomeFantasiaSearch", "matrizFilial", "situacaoCadastralCodigo",
    "situacaoCadastral", "dataSituacaoCadastral", "motivoSituacaoCodigo",
    "motivoSituacaoCadastral", "dataInicioAtividade", "cnaePrincipal",
    "cnaePrincipalDescricao", "cnaesSecundarios", "naturezaJuridicaCodigo",
    "naturezaJuridica", "porteCodigo", "porte", "capitalSocial",
    "qualificacaoResponsavelCodigo", "qualificacaoResponsavel", "enteFederativoResponsavel",
    "opcaoSimples", "dataOpcaoSimples", "dataExclusaoSimples", "opcaoMei", "dataOpcaoMei",
    "dataExclusaoMei", "tipoLogradouro", "logradouro", "numero", "complemento", "bairro",
    "cep", "municipioCodigoReceita", "municipioIbge", "municipioNome", "municipioNomeSearch", "uf", "ddd1",
    "telefone1", "ddd2", "telefone2", "dddFax", "fax", "email", "icpTier", "icpScore",
    "icpReasons", "icpTaxonomyVersion", "icpCalculatedAt", "hasRntrc", "rntrcStatus",
    "rntrcType", "rntrcNumber", "rntrcSource", "rntrcUpdatedAt", "dataOrigin", "competencia",
]
MAPPING_COLUMNS = [
    "receitaCode", "receitaName", "uf", "ibgeCode", "ibgeName", "region", "mappingMethod", "sourceVersion",
]

DATE_COLUMNS = {
    "dataSituacaoCadastral", "dataInicioAtividade", "dataOpcaoSimples", "dataExclusaoSimples",
    "dataOpcaoMei", "dataExclusaoMei",
}
TIMESTAMP_COLUMNS = {"icpCalculatedAt", "rntrcUpdatedAt"}
JSON_COLUMNS = {"cnaesSecundarios", "icpReasons"}
INT_COLUMNS = {"icpScore"}
DECIMAL_COLUMNS = {"capitalSocial"}
BOOLEAN_COLUMNS = {"hasRntrc"}
ENUM_COLUMNS = {
    "icpTier": "MarketIntelligenceIcpTier",
    "dataOrigin": "MarketIntelligenceDataOrigin",
}


def sql_literal(value: str | None) -> str:
    return "NULL" if value is None else "'" + value.replace("'", "''") + "'"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def psql_copy_path(path: Path) -> str:
    return str(path.resolve()).replace("\\", "/").replace("'", "''")


class Psql:
    def __init__(self, executable: str, database_url: str) -> None:
        self.executable = executable
        self.database_url = database_url

    def run(self, sql: str, *, tuples_only: bool = False) -> str:
        command = [self.executable, "-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--dbname", self.database_url]
        if tuples_only:
            command.extend(["--tuples-only", "--no-align"])
        result = subprocess.run(
            command, input=sql, text=True, encoding="utf-8", capture_output=True, check=False,
        )
        if result.returncode != 0:
            message = (result.stderr or result.stdout or "Falha desconhecida do psql").strip()
            raise RuntimeError(message)
        return result.stdout.strip()

    def scalar(self, sql: str) -> str:
        output = self.run("SET app.bypass_rls='on';\n" + sql, tuples_only=True)
        return output.splitlines()[-1].strip() if output else ""


def validate_manifest(manifest_path: Path) -> dict[str, Any]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    required = ["dataset", "source", "competencia", "pipelineVersion", "datasetHash", "files", "stats"]
    missing = [key for key in required if not manifest.get(key)]
    if missing:
        raise ValueError(f"Manifest sem campos obrigatorios: {', '.join(missing)}")
    if manifest["dataset"] != "CNPJ_COMPANIES":
        raise ValueError("Manifest nao pertence ao dataset CNPJ_COMPANIES")
    if len(manifest["datasetHash"]) != 64:
        raise ValueError("datasetHash deve ser SHA-256")
    root = manifest_path.parent
    total = 0
    for item in manifest["files"]:
        path = root / item["path"]
        if not path.is_file() or path.suffix != ".gz":
            raise ValueError(f"Arquivo normalizado ausente/invalido: {path}")
        if sha256_file(path) != item["sha256"]:
            raise ValueError(f"Hash divergente: {path}")
        with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
            header = next(csv.reader(handle), [])
        if header != COMPANY_COLUMNS:
            raise ValueError(f"Cabecalho empresarial divergente: {path}")
        total += int(item["records"])
    if total != int(manifest["stats"].get("recordsExported", -1)):
        raise ValueError(f"Contagem do manifest diverge dos arquivos: {total}")
    mapping = manifest.get("municipalityMappingFile") or {}
    mapping_path = root / str(mapping.get("path") or "")
    if not mapping_path.is_file() or sha256_file(mapping_path) != mapping.get("sha256"):
        raise ValueError("Crosswalk municipal ausente ou com hash divergente")
    with gzip.open(mapping_path, "rt", encoding="utf-8", newline="") as handle:
        if next(csv.reader(handle), []) != MAPPING_COLUMNS:
            raise ValueError("Cabecalho do crosswalk municipal divergente")
    return manifest


def text_stage_definition(columns: Sequence[str]) -> str:
    return ",\n".join(f'  "{column}" TEXT' for column in columns)


def copy_columns(columns: Sequence[str]) -> str:
    return ",".join(f'"{column}"' for column in columns)


def company_select_expression(column: str) -> str:
    source = f's."{column}"'
    nullable = f"NULLIF({source}, '')"
    if column in DATE_COLUMNS:
        return f"{nullable}::date"
    if column in TIMESTAMP_COLUMNS:
        return f"{nullable}::timestamp"
    if column in JSON_COLUMNS:
        return f"{nullable}::jsonb"
    if column in INT_COLUMNS:
        return f"{nullable}::integer"
    if column in DECIMAL_COLUMNS:
        return f"{nullable}::numeric(20,2)"
    if column in BOOLEAN_COLUMNS:
        return f"CASE WHEN {source}='' THEN NULL WHEN upper({source}) IN ('TRUE','T','1','SIM') THEN true ELSE false END"
    if column in ENUM_COLUMNS:
        return f"{nullable}::{chr(34)}{ENUM_COLUMNS[column]}{chr(34)}"
    if column in {"cnpj", "cnpjBasico", "cnpjOrdem", "cnpjDv", "razaoSocial", "razaoSocialSearch", "competencia"}:
        return source
    return nullable


def decompress_to_temp(source: Path) -> Path:
    handle = tempfile.NamedTemporaryFile(prefix="atlas-mi-", suffix=".csv", delete=False)
    target = Path(handle.name)
    handle.close()
    try:
        with gzip.open(source, "rb") as input_handle, target.open("wb") as output_handle:
            shutil.copyfileobj(input_handle, output_handle, length=1024 * 1024)
        return target
    except Exception:
        target.unlink(missing_ok=True)
        raise


def import_mapping(psql: Psql, manifest_path: Path, manifest: dict[str, Any]) -> None:
    item = manifest["municipalityMappingFile"]
    compressed = manifest_path.parent / item["path"]
    plain = decompress_to_temp(compressed)
    try:
        sql = f"""
BEGIN;
SET LOCAL app.bypass_rls='on';
CREATE TEMP TABLE mi_mapping_stage (
{text_stage_definition(MAPPING_COLUMNS)}
) ON COMMIT DROP;
\\copy mi_mapping_stage ({copy_columns(MAPPING_COLUMNS)}) FROM '{psql_copy_path(plain)}' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
INSERT INTO "MarketIntelligenceMunicipalityMapping" (
  "id","receitaCode","receitaName","uf","ibgeCode","ibgeName","region","mappingMethod","sourceVersion","importedAt"
)
SELECT md5('RFB_IBGE:' || "receitaCode"),"receitaCode","receitaName","uf","ibgeCode","ibgeName",
       NULLIF("region",''),"mappingMethod","sourceVersion",CURRENT_TIMESTAMP
FROM mi_mapping_stage
ON CONFLICT ("receitaCode") DO UPDATE SET
  "receitaName"=EXCLUDED."receitaName", "uf"=EXCLUDED."uf", "ibgeCode"=EXCLUDED."ibgeCode",
  "ibgeName"=EXCLUDED."ibgeName", "region"=EXCLUDED."region", "mappingMethod"=EXCLUDED."mappingMethod",
  "sourceVersion"=EXCLUDED."sourceVersion", "importedAt"=EXCLUDED."importedAt";
COMMIT;
"""
        psql.run(sql)
    finally:
        plain.unlink(missing_ok=True)


def import_company_file(psql: Psql, dataset_id: str, compressed: Path) -> None:
    plain = decompress_to_temp(compressed)
    target_columns = ["id", "datasetId", *COMPANY_COLUMNS, "importedAt"]
    select_values = [
        f"md5({sql_literal(dataset_id)} || ':' || s.\"cnpj\")",
        sql_literal(dataset_id),
        *(company_select_expression(column) for column in COMPANY_COLUMNS),
        "CURRENT_TIMESTAMP",
    ]
    try:
        sql = f"""
BEGIN;
SET LOCAL app.bypass_rls='on';
CREATE TEMP TABLE mi_company_stage (
{text_stage_definition(COMPANY_COLUMNS)}
) ON COMMIT DROP;
\\copy mi_company_stage ({copy_columns(COMPANY_COLUMNS)}) FROM '{psql_copy_path(plain)}' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
INSERT INTO "MarketIntelligenceCompany" ({copy_columns(target_columns)})
SELECT {','.join(select_values)} FROM mi_company_stage s
ON CONFLICT ("datasetId","cnpj") DO NOTHING;
COMMIT;
"""
        psql.run(sql)
    finally:
        plain.unlink(missing_ok=True)


def create_or_reset_dataset(psql: Psql, manifest: dict[str, Any]) -> tuple[str, bool]:
    dataset_hash = manifest["datasetHash"]
    existing = psql.scalar(
        f"SELECT coalesce(\"id\" || '|' || \"status\"::text,'') FROM \"MarketIntelligenceDataset\" "
        f"WHERE \"dataset\"='CNPJ_COMPANIES' AND \"competencia\"={sql_literal(manifest['competencia'])} "
        f"AND \"hash\"={sql_literal(dataset_hash)} LIMIT 1;"
    )
    if existing:
        dataset_id, status = existing.split("|", 1)
        if status == "READY":
            return dataset_id, True
        psql.run(f"""
BEGIN;
SET LOCAL app.bypass_rls='on';
DELETE FROM "MarketIntelligenceCompany" WHERE "datasetId"={sql_literal(dataset_id)};
UPDATE "MarketIntelligenceDataset" SET "status"='PROCESSING',"startedAt"=CURRENT_TIMESTAMP,
  "finishedAt"=NULL,"error"=NULL,"recordsRead"=0,"recordsImported"=0,"recordsRejected"=0,
  "recordsActive"=0,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"={sql_literal(dataset_id)};
COMMIT;
""")
        return dataset_id, False

    dataset_id = str(uuid.uuid4())
    stats = manifest["stats"]
    psql.run(f"""
SET app.bypass_rls='on';
INSERT INTO "MarketIntelligenceDataset" (
  "id","dataset","competencia","source","sourceVersion","sourceUrl","status","startedAt",
  "recordsRead","recordsImported","recordsRejected","recordsActive","hash","pipelineVersion",
  "outputManifest","createdAt","updatedAt"
) VALUES (
  {sql_literal(dataset_id)},'CNPJ_COMPANIES',{sql_literal(manifest['competencia'])},
  {sql_literal(manifest['source'])},{sql_literal(manifest.get('sourceVersion'))},
  {sql_literal(manifest.get('sourceUrl'))},'PROCESSING',CURRENT_TIMESTAMP,
  {int(stats.get('establishmentRowsRead',0))},0,{sum(int(v) for v in manifest.get('rejections',{}).values())},0,
  {sql_literal(manifest['datasetHash'])},{sql_literal(manifest['pipelineVersion'])},
  {sql_literal(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))}::jsonb,
  CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);
""")
    return dataset_id, False


def publish(psql: Psql, dataset_id: str, records: int, active_records: int) -> None:
    psql.run(f"""
BEGIN;
SET LOCAL app.bypass_rls='on';
UPDATE "MarketIntelligenceDataset" SET "status"='ARCHIVED',"publicationSlot"=NULL,
  "updatedAt"=CURRENT_TIMESTAMP WHERE "publicationSlot"='CNPJ_ACTIVE' AND "id"<>{sql_literal(dataset_id)};
UPDATE "MarketIntelligenceDataset" SET "status"='READY',"publicationSlot"='CNPJ_ACTIVE',
  "recordsImported"={records},"recordsActive"={active_records},"finishedAt"=CURRENT_TIMESTAMP,
  "activatedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"={sql_literal(dataset_id)};
COMMIT;
""")


def mark_failed(psql: Psql, dataset_id: str, error: str) -> None:
    safe_error = error[:4000]
    try:
        psql.run(f"""
SET app.bypass_rls='on';
UPDATE "MarketIntelligenceDataset" SET "status"='FAILED',"finishedAt"=CURRENT_TIMESTAMP,
  "error"={sql_literal(safe_error)},"updatedAt"=CURRENT_TIMESTAMP
WHERE "id"={sql_literal(dataset_id)} AND "publicationSlot" IS NULL;
""")
    except Exception:
        pass


def run_import(manifest_path: Path, psql: Psql) -> dict[str, Any]:
    started = time.perf_counter()
    manifest = validate_manifest(manifest_path)
    dataset_id, already_ready = create_or_reset_dataset(psql, manifest)
    if already_ready:
        records = int(psql.scalar(
            f"SELECT count(*) FROM \"MarketIntelligenceCompany\" WHERE \"datasetId\"={sql_literal(dataset_id)};"
        ))
        expected = int(manifest["stats"]["recordsExported"])
        if records != expected:
            raise RuntimeError(f"Dataset READY inconsistente: banco={records}, manifest={expected}")
        publish(psql, dataset_id, records, int(manifest["stats"].get("activeRecordsExported", 0)))
        return {"datasetId": dataset_id, "status": "READY", "idempotent": True, "records": records}

    try:
        import_mapping(psql, manifest_path, manifest)
        imported = 0
        for index, item in enumerate(manifest["files"], start=1):
            source = manifest_path.parent / item["path"]
            print(json.dumps({"phase": "COPY", "file": item["path"], "index": index,
                              "files": len(manifest["files"]), "records": item["records"]}))
            import_company_file(psql, dataset_id, source)
            imported += int(item["records"])
            psql.run(f"""
SET app.bypass_rls='on';
UPDATE "MarketIntelligenceDataset" SET "recordsImported"={imported},"updatedAt"=CURRENT_TIMESTAMP
WHERE "id"={sql_literal(dataset_id)};
""")
            print(json.dumps({"phase": "IMPORTED", "file": item["path"], "recordsImported": imported,
                              "elapsedSeconds": round(time.perf_counter() - started, 3)}), flush=True)

        psql.run(f"SET app.bypass_rls='on'; UPDATE \"MarketIntelligenceDataset\" SET \"status\"='VALIDATING',\"updatedAt\"=CURRENT_TIMESTAMP WHERE \"id\"={sql_literal(dataset_id)};")
        records = int(psql.scalar(
            f"SELECT count(*) FROM \"MarketIntelligenceCompany\" WHERE \"datasetId\"={sql_literal(dataset_id)};"
        ))
        active = int(psql.scalar(
            f"SELECT count(*) FROM \"MarketIntelligenceCompany\" WHERE \"datasetId\"={sql_literal(dataset_id)} AND \"situacaoCadastral\"='ATIVA';"
        ))
        expected = int(manifest["stats"]["recordsExported"])
        expected_active = int(manifest["stats"].get("activeRecordsExported", 0))
        if records != expected or active != expected_active:
            raise RuntimeError(
                f"Validacao de contagem falhou: banco={records}/{active} manifest={expected}/{expected_active}"
            )
        territorial = manifest.get("territorialValidation")
        if territorial:
            territory_count = int(psql.scalar(
                f"SELECT count(*) FROM \"MarketIntelligenceCompany\" WHERE \"datasetId\"={sql_literal(dataset_id)} "
                f"AND \"municipioIbge\"={sql_literal(territorial['municipioIbge'])} AND \"situacaoCadastral\"='ATIVA';"
            ))
            if territory_count != int(territorial["activeRecords"]):
                raise RuntimeError("Reconciliacao municipal divergiu do agregado produzido pelo ETL")
        publish(psql, dataset_id, records, active)
        return {
            "datasetId": dataset_id, "status": "READY", "idempotent": False,
            "records": records, "activeRecords": active,
            "durationSeconds": round(time.perf_counter() - started, 3),
        }
    except Exception as error:
        mark_failed(psql, dataset_id, str(error))
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--database-url", default=os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL"))
    parser.add_argument("--psql", default=os.getenv("PSQL_BIN") or "psql")
    args = parser.parse_args()
    if not args.database_url:
        raise SystemExit("DATABASE_URL ou DIRECT_URL nao configurada")
    if not args.manifest.is_file():
        raise SystemExit(f"Manifest nao encontrado: {args.manifest}")
    if not shutil.which(args.psql) and not Path(args.psql).is_file():
        raise SystemExit(f"psql nao encontrado: {args.psql}")
    result = run_import(args.manifest.resolve(), Psql(args.psql, args.database_url))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
