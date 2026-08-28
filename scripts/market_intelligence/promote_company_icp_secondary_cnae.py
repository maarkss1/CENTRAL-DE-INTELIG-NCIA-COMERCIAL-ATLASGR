"""Promove icpTier usando CNAE secundario - PASSADA 2, so' para quem ficou FORA_DO_ICP na
passada 1 (compute_company_icp.py, que classifica so' por CNAE principal).

Roda depois de compute_company_icp.py. Filtra por "icpTier" = 'FORA_DO_ICP' (marcado pela
passada 1 com o motivo CNAE_SECUNDARIO_AINDA_NAO_AVALIADO em icpReasons), reduzindo
drasticamente quantas linhas pagam o custo de jsonb_array_elements() sobre "cnaesSecundarios"
(TOASTed, potencialmente grande) - esse custo, nao quantas vezes e' avaliado por linha, foi o
que travou a tentativa anterior de fazer tudo numa passada so' em ~170-270 linhas/s.

So atualiza a linha se um CNAE secundario realmente casar com algum tier (promove
FORA_DO_ICP -> A/B/C); quem continuar sem match em nenhum CNAE (principal ou secundario)
mantem FORA_DO_ICP, agora com o motivo atualizado para refletir que o CNAE secundario
tambem foi avaliado.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent.parent
TAXONOMY_PATH = PROJECT / "public" / "tools" / "atlas-market-intelligence" / "icp_taxonomy.v1.json"

TIER_TO_ENUM = {"A": "ALTO", "B": "MEDIO", "C": "BAIXO"}
TIER_TO_REASON = {
    "A": '["CNAE_SECUNDARIO_TIER_A","TAXONOMIA_ICP_V1_NAO_CALIBRADA"]',
    "B": '["CNAE_SECUNDARIO_TIER_B","TAXONOMIA_ICP_V1_NAO_CALIBRADA"]',
    "C": '["CNAE_SECUNDARIO_TIER_C","TAXONOMIA_ICP_V1_NAO_CALIBRADA"]',
}
FORA_DO_ICP_REASON_FINAL = '["SEM_CNAE_PRINCIPAL_OU_SECUNDARIO_ADERENTE_TAXONOMIA_V1"]'


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def prefix_array_sql(prefixes: list[str]) -> str:
    literals = ", ".join(f"'{sql_escape(prefix)}%'" for prefix in prefixes)
    return f"ARRAY[{literals}]"


def build_match_condition(prefixes: list[str]) -> str:
    array_sql = prefix_array_sql(prefixes)
    return (
        f"EXISTS (SELECT 1 FROM jsonb_array_elements(\"cnaesSecundarios\") elem "
        f"WHERE (elem->>'code') LIKE ANY ({array_sql}))"
    )


def build_sql(taxonomy: dict) -> str:
    precedence = taxonomy["precedence"]
    taxonomy_version = f"icp_taxonomy.v1.json@{taxonomy['version']}-cnae-secundario"

    icp_tier_case = "\n    ".join(
        f"WHEN {build_match_condition(taxonomy['tiers'][tier]['cnaePrefixes'])} THEN '{TIER_TO_ENUM[tier]}'"
        for tier in precedence
    )
    icp_reasons_case = "\n    ".join(
        f"WHEN {build_match_condition(taxonomy['tiers'][tier]['cnaePrefixes'])} THEN '{TIER_TO_REASON[tier]}'::jsonb"
        for tier in precedence
    )

    return f"""\\set ON_ERROR_STOP on

BEGIN;
SET LOCAL app.bypass_rls='on';
SET LOCAL work_mem = '256MB';

DO $$
DECLARE
  active_dataset_id TEXT;
BEGIN
  SELECT "id" INTO active_dataset_id FROM "MarketIntelligenceDataset" WHERE "publicationSlot" = 'CNPJ_ACTIVE' LIMIT 1;
  IF active_dataset_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum dataset com publicationSlot = CNPJ_ACTIVE encontrado!';
  END IF;
END $$;

-- so' avalia jsonb_array_elements para quem ja' esta' FORA_DO_ICP (subconjunto pequeno da
-- passada 1) e tem pelo menos um CNAE secundario -- evita o custo para a maioria das linhas.
UPDATE "MarketIntelligenceCompany"
SET
  "icpTier" = (CASE
    {icp_tier_case}
    ELSE 'FORA_DO_ICP'
  END)::"MarketIntelligenceIcpTier",
  "icpReasons" = (CASE
    {icp_reasons_case}
    ELSE '{FORA_DO_ICP_REASON_FINAL}'::jsonb
  END),
  "icpTaxonomyVersion" = '{sql_escape(taxonomy_version)}',
  "icpCalculatedAt" = CURRENT_TIMESTAMP
WHERE "datasetId" = (SELECT "id" FROM "MarketIntelligenceDataset" WHERE "publicationSlot" = 'CNPJ_ACTIVE' LIMIT 1)
  AND "situacaoCadastral" = 'ATIVA'
  AND "icpTier" = 'FORA_DO_ICP'
  AND "cnaesSecundarios" IS NOT NULL
  AND jsonb_array_length("cnaesSecundarios") > 0;

COMMIT;

SELECT set_config('app.bypass_rls', 'on', TRUE);
SELECT "icpTier", COUNT(*) FROM "MarketIntelligenceCompany"
WHERE "datasetId" = (SELECT "id" FROM "MarketIntelligenceDataset" WHERE "publicationSlot" = 'CNPJ_ACTIVE' LIMIT 1)
GROUP BY "icpTier" ORDER BY "icpTier" NULLS FIRST;
"""


def run_promote_icp(database_url: str, psql_bin: str) -> None:
    taxonomy = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    sql = build_sql(taxonomy)

    print("Promovendo ICP via CNAE secundario (so' quem ficou FORA_DO_ICP na passada 1)...")
    result = subprocess.run(
        [psql_bin, "-X", "--set", "ON_ERROR_STOP=1", "--dbname", database_url],
        input=sql,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Erro na promocao de ICP: {result.stderr or result.stdout}")
    print(result.stdout)
    print("Promocao de ICP (CNAE secundario) finalizada!")


if __name__ == "__main__":
    db_url = os.environ.get("DATABASE_URL", "postgresql://prospector_app:prospector_app_pass@localhost:5434/prospectordb")
    psql = os.environ.get("PSQL_BIN", r"C:\Program Files\PostgreSQL\16\bin\psql.exe")
    sys.exit(run_promote_icp(db_url, psql) or 0)
