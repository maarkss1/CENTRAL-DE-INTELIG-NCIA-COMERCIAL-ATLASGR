"""Calcula icpTier/icpReasons por CNPJ no dataset nacional ativo do Market Intelligence -
PASSADA 1: apenas CNAE principal.

Reaplica, em SQL set-based, a mesma logica ja usada e testada em
public/tools/atlas-market-intelligence/etl_cnpj_atlas.py (funcao tier_for_cnaes), mas
limitada ao CNAE principal (coluna de texto simples). CNAE secundario (jsonb TOASTed) fica
para a passada 2 (promote_company_icp_secondary_cnae.py) de proposito: uma tentativa anterior
que avaliava jsonb_array_elements()/array_agg() sobre os ~28M CNPJs ATIVA travou em ~170-270
linhas/s (ETA de dezenas de horas) mesmo apos otimizacoes, porque o custo real esta em
destoastar/parsear esse jsonb em escala nacional, nao em quantas vezes ele e' lido por linha.
Esta passada evita esse custo por completo (so LIKE ANY em texto), e a passada 2 so paga esse
custo para quem ainda ficou FORA_DO_ICP aqui - um subconjunto bem menor.

Mapeamento de tier setorial (A/B/C) para o enum MarketIntelligenceIcpTier:
  A -> ALTO   | B -> MEDIO   | C -> BAIXO   | nenhum match -> FORA_DO_ICP

Nao usa MUITO_ALTO: a taxonomia v1 e' puramente setorial por CNAE (o proprio
arquivo se autodeclara "status": "REGRA_DE_MODELO_NAO_CALIBRADA") e nao
incorpora frota/MDF-e/risco/porte. Reservar MUITO_ALTO para quando esses
sinais adicionais confirmarem o fit evita inventar uma confianca que a
taxonomia ainda nao sustenta.

Por esse mesmo motivo, icpScore NAO e' preenchido por este script (fica NULL) -
nao existe hoje um modelo calibrado de pontuacao, so classificacao setorial.

Escopo: apenas empresas com situacaoCadastral='ATIVA' no dataset com
publicationSlot='CNPJ_ACTIVE', espelhando o filtro ACTIVE_SITUATION ("02") do
ETL municipal de referencia. Empresas inativas mantem icpTier NULL (nao
calculado), em vez de FORA_DO_ICP.
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
    "A": '["CNAE_PRINCIPAL_TIER_A","TAXONOMIA_ICP_V1_NAO_CALIBRADA"]',
    "B": '["CNAE_PRINCIPAL_TIER_B","TAXONOMIA_ICP_V1_NAO_CALIBRADA"]',
    "C": '["CNAE_PRINCIPAL_TIER_C","TAXONOMIA_ICP_V1_NAO_CALIBRADA"]',
}
FORA_DO_ICP_REASON = '["SEM_CNAE_PRINCIPAL_ADERENTE_TAXONOMIA_V1","CNAE_SECUNDARIO_AINDA_NAO_AVALIADO"]'


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def prefix_array_sql(prefixes: list[str]) -> str:
    literals = ", ".join(f"'{sql_escape(prefix)}%'" for prefix in prefixes)
    return f"ARRAY[{literals}]"


def build_sql(taxonomy: dict) -> str:
    precedence = taxonomy["precedence"]
    taxonomy_version = f"icp_taxonomy.v1.json@{taxonomy['version']}-cnae-principal-only"

    icp_tier_case = "\n    ".join(
        f"WHEN \"cnaePrincipal\" LIKE ANY ({prefix_array_sql(taxonomy['tiers'][tier]['cnaePrefixes'])}) THEN '{TIER_TO_ENUM[tier]}'"
        for tier in precedence
    )
    icp_reasons_case = "\n    ".join(
        f"WHEN \"cnaePrincipal\" LIKE ANY ({prefix_array_sql(taxonomy['tiers'][tier]['cnaePrefixes'])}) THEN '{TIER_TO_REASON[tier]}'::jsonb"
        for tier in precedence
    )

    return f"""\\set ON_ERROR_STOP on

DROP INDEX IF EXISTS "MarketIntelligenceCompany_datasetId_icpScore_idx";
DROP INDEX IF EXISTS "MarketIntelligenceCompany_datasetId_municipioIbge_icpTier_idx";

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

-- Sem CTE/JOIN de proposito: um UPDATE direto com WHERE faz UMA unica varredura da tabela
-- (nao duas, como a abordagem anterior baseada em Hash Join contra uma CTE derivada), e nao
-- toca em "cnaesSecundarios" (jsonb) em momento nenhum -- so comparacoes LIKE em texto puro.
UPDATE "MarketIntelligenceCompany"
SET
  "icpTier" = (CASE
    {icp_tier_case}
    ELSE 'FORA_DO_ICP'
  END)::"MarketIntelligenceIcpTier",
  "icpReasons" = (CASE
    {icp_reasons_case}
    ELSE '{FORA_DO_ICP_REASON}'::jsonb
  END),
  "icpTaxonomyVersion" = '{sql_escape(taxonomy_version)}',
  "icpCalculatedAt" = CURRENT_TIMESTAMP
WHERE "datasetId" = (SELECT "id" FROM "MarketIntelligenceDataset" WHERE "publicationSlot" = 'CNPJ_ACTIVE' LIMIT 1)
  AND "situacaoCadastral" = 'ATIVA';

COMMIT;

SELECT set_config('app.bypass_rls', 'on', TRUE);
SELECT "icpTier", COUNT(*) FROM "MarketIntelligenceCompany"
WHERE "datasetId" = (SELECT "id" FROM "MarketIntelligenceDataset" WHERE "publicationSlot" = 'CNPJ_ACTIVE' LIMIT 1)
GROUP BY "icpTier" ORDER BY "icpTier" NULLS FIRST;
"""


def run_compute_icp(database_url: str, psql_bin: str) -> None:
    taxonomy = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    sql = build_sql(taxonomy)

    print("Calculando ICP por empresa (CNAE principal apenas) no PostgreSQL...")
    result = subprocess.run(
        [psql_bin, "-X", "--set", "ON_ERROR_STOP=1", "--dbname", database_url],
        input=sql,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Erro no calculo de ICP: {result.stderr or result.stdout}")
    print(result.stdout)
    print("Calculo de ICP (CNAE principal) finalizado. Reconstruindo indices...")

    rebuild_script = PROJECT / ".codex-tools" / "rebuild-market-intelligence-indexes.sql"
    rebuild = subprocess.run(
        [psql_bin, "-X", "--set", "ON_ERROR_STOP=1", "--dbname", database_url, "-f", str(rebuild_script)],
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    if rebuild.returncode != 0:
        raise RuntimeError(f"Erro ao reconstruir indices: {rebuild.stderr or rebuild.stdout}")
    print(rebuild.stdout)
    print("Indices reconstruidos com sucesso!")


if __name__ == "__main__":
    db_url = os.environ.get("DATABASE_URL", "postgresql://prospector_app:prospector_app_pass@localhost:5434/prospectordb")
    psql = os.environ.get("PSQL_BIN", r"C:\Program Files\PostgreSQL\16\bin\psql.exe")
    sys.exit(run_compute_icp(db_url, psql) or 0)
