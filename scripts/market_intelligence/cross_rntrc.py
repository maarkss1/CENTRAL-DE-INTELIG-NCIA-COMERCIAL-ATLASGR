import os
import sys
import subprocess
from pathlib import Path

def run_cross_rntrc(database_url: str, psql_bin: str):
    rntrc_csv = Path(".cache/market-intelligence/rntrc_by_cnpj.csv").resolve()
    if not rntrc_csv.is_file():
        raise FileNotFoundError(f"Arquivo RNTRC nao encontrado: {rntrc_csv}")

    csv_path_escaped = str(rntrc_csv).replace("\\", "/").replace("'", "''")

    sql = f"""\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL app.bypass_rls='on';

CREATE TEMP TABLE temp_rntrc (
  cnpj TEXT,
  "rntrcNumber" TEXT,
  "rntrcStatus" TEXT,
  "rntrcType" TEXT
) ON COMMIT DROP;

\\copy temp_rntrc (cnpj, "rntrcNumber", "rntrcStatus", "rntrcType") FROM '{csv_path_escaped}' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');

CREATE INDEX idx_temp_rntrc_cnpj ON temp_rntrc (cnpj);

DO $$
DECLARE
  active_dataset_id TEXT;
  rntrc_count BIGINT;
BEGIN
  SELECT "id" INTO active_dataset_id FROM "MarketIntelligenceDataset" WHERE "publicationSlot" = 'CNPJ_ACTIVE' LIMIT 1;
  IF active_dataset_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum dataset com publicationSlot = CNPJ_ACTIVE encontrado!';
  END IF;
  SELECT COUNT(*) INTO rntrc_count FROM temp_rntrc;
  RAISE NOTICE 'Cruzando % registros RNTRC no dataset ativo %...', rntrc_count, active_dataset_id;
END $$;

WITH active_ds AS (
  SELECT "id" FROM "MarketIntelligenceDataset" WHERE "publicationSlot" = 'CNPJ_ACTIVE' LIMIT 1
)
UPDATE "MarketIntelligenceCompany" c
SET "hasRntrc" = true,
    "rntrcNumber" = r."rntrcNumber",
    "rntrcStatus" = r."rntrcStatus",
    "rntrcType" = r."rntrcType",
    "rntrcSource" = 'ANTT_RNTRC',
    "rntrcUpdatedAt" = CURRENT_TIMESTAMP
FROM temp_rntrc r, active_ds
WHERE c."datasetId" = active_ds."id"
  AND c."cnpj" = r.cnpj;

COMMIT;

SELECT set_config('app.bypass_rls', 'on', TRUE);
SELECT COUNT(*) as "totalEmpresasComRntrc"
FROM "MarketIntelligenceCompany"
WHERE "datasetId" = (SELECT "id" FROM "MarketIntelligenceDataset" WHERE "publicationSlot" = 'CNPJ_ACTIVE' LIMIT 1)
  AND "hasRntrc" = true;
"""

    print("Executando cruzamento RNTRC no PostgreSQL...")
    result = subprocess.run(
        [psql_bin, "-X", "--set", "ON_ERROR_STOP=1", "--dbname", database_url],
        input=sql,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Erro no cruzamento RNTRC: {result.stderr or result.stdout}")
    print(result.stdout)
    print("Cruzamento RNTRC finalizado com sucesso!")

if __name__ == "__main__":
    db_url = os.environ.get("DATABASE_URL", "postgresql://prospector_app:prospector_app_pass@localhost:5434/prospectordb")
    psql = os.environ.get("PSQL_BIN", r"C:\Program Files\PostgreSQL\16\bin\psql.exe")
    run_cross_rntrc(db_url, psql)
