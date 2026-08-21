-- AI-003 (onda 31): torna a persistência de AgentMemory honesta. Antes desta migration, 4/5
-- caminhos de escrita faziam findFirst-por-sessionId+organizationId (sem agentType) seguido de
-- create/update condicional sem transação — uma corrida real: duas chamadas concorrentes com o
-- mesmo sessionId podiam ambas ver "não existe" e ambas criar uma linha, duplicando o registro. Sem
-- nenhuma unique constraint, o Postgres nunca impedia isso. O código de aplicação (agentMemory.store.ts)
-- passa a usar um upsert atômico real sobre (sessionId, agentType, organizationId); esta migration
-- prepara o schema para isso: colapsa duplicatas já existentes, adiciona status/errorMessage/updatedAt
-- (antes não havia como saber se uma linha ausente significava "ainda rodando" ou "falhou antes de
-- gravar", nem quando uma linha foi atualizada pela última vez), e por fim cria a unique constraint.
--
-- Escrita à mão (não via `prisma migrate dev`) pela mesma limitação de shadow database já
-- documentada em ondas anteriores (`.agents/runs/onda-5.md`). Aplicada e validada contra Postgres
-- real neste ambiente.

-- Colapsa duplicatas existentes ANTES de criar a unique constraint (que falharia na presença de
-- qualquer duplicata). Só considera organizationId NOT NULL: linhas legadas sem tenant (NULL) nunca
-- colidem num índice único do Postgres (NULL != NULL), então não precisam de dedup para a
-- constraint funcionar, e não há como saber com segurança qual delas é "a mais recente de verdade"
-- sem um tenant para desambiguar.
DELETE FROM "AgentMemory" a
USING "AgentMemory" b
WHERE a."sessionId" = b."sessionId"
  AND a."agentType" = b."agentType"
  AND a."organizationId" = b."organizationId"
  AND a."organizationId" IS NOT NULL
  AND (a."createdAt" < b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" < b."id"));

-- CreateEnum
CREATE TYPE "AgentMemoryStatus" AS ENUM ('Completed', 'Failed');

-- AlterTable
ALTER TABLE "AgentMemory" ADD COLUMN "status" "AgentMemoryStatus" NOT NULL DEFAULT 'Completed';
ALTER TABLE "AgentMemory" ADD COLUMN "errorMessage" TEXT;
ALTER TABLE "AgentMemory" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "AgentMemory" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "AgentMemory" ALTER COLUMN "updatedAt" SET NOT NULL;
-- Sem DEFAULT no banco de propósito: @updatedAt é gerenciado pelo Prisma Client a cada
-- update()/upsert(), não por um default de coluna (mesma convenção que `prisma migrate diff`
-- confirma para todo outro campo @updatedAt já existente no schema).

-- DropIndex
DROP INDEX "AgentMemory_sessionId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "AgentMemory_sessionId_agentType_organizationId_key" ON "AgentMemory"("sessionId", "agentType", "organizationId");
