-- BitrixConnection/BitrixSyncRule têm FORCE ROW LEVEL SECURITY — sem este bypass, o UPDATE/DELETE
-- de backfill abaixo silenciosamente afeta 0 linhas (a migration roda como o papel NOSUPERUSER da
-- aplicação, sem nenhum app.current_tenant_id/bypass_rls setado por padrão), e a etapa seguinte
-- (SET NOT NULL) falha com "column contains null values" mesmo com dado real na tabela.
SET app.bypass_rls = 'on';

-- Uma organização Atlas pode ter mais de um portal Bitrix24 conectado (ex.: AtlasGR e TotalTrac
-- são marcas/empresas distintas, cada uma com seu próprio Bitrix) — remove a constraint 1:1.
DROP INDEX IF EXISTS "BitrixConnection_organizationId_key";
CREATE INDEX "BitrixConnection_organizationId_idx" ON "BitrixConnection"("organizationId");

ALTER TABLE "BitrixConnection" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'Bitrix24';

-- BitrixSyncRule passa a apontar pra uma conexão específica, não só pro tenant (uma regra só faz
-- sentido escopada a UM portal Bitrix). Backfill: no momento desta migration cada organização
-- tinha no máximo uma BitrixConnection, então o mapeamento é direto por organizationId.
ALTER TABLE "BitrixSyncRule" ADD COLUMN "connectionId" TEXT;

UPDATE "BitrixSyncRule" r
SET "connectionId" = c.id
FROM "BitrixConnection" c
WHERE c."organizationId" = r."organizationId";

-- Regras órfãs (sem BitrixConnection correspondente no momento da migration) não têm como ficar
-- funcionais — removidas em vez de deixar uma FK quebrada.
DELETE FROM "BitrixSyncRule" WHERE "connectionId" IS NULL;

ALTER TABLE "BitrixSyncRule" ALTER COLUMN "connectionId" SET NOT NULL;
ALTER TABLE "BitrixSyncRule"
    ADD CONSTRAINT "BitrixSyncRule_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "BitrixConnection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "BitrixSyncRule_connectionId_idx" ON "BitrixSyncRule"("connectionId");
