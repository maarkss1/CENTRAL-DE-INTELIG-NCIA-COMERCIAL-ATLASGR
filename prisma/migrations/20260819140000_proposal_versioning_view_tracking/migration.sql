-- CYC-005 (onda 25): timestamps reais de envio/visualização em CrmCommercialDocument. `sentAt` é
-- gravado na transição de status para "Enviado"; `firstViewedAt`/`lastViewedAt`/`viewCount` são
-- gravados pela rota pública de rastreamento (GET /api/public/proposals/:token/view) toda vez que
-- o link público (publicToken) é aberto — ver prisma/schema.prisma e
-- src/features/crm360/infra/PrismaCrm360Repository.ts.
--
-- Escrita à mão (não via `prisma migrate dev`) por limitação de ambiente no shadow database
-- (permissão negada para criar banco) — mesmo workaround já usado nas Ondas 5 e 22.

-- AlterTable
ALTER TABLE "CrmCommercialDocument"
    ADD COLUMN "sentAt" TIMESTAMP(3),
    ADD COLUMN "firstViewedAt" TIMESTAMP(3),
    ADD COLUMN "lastViewedAt" TIMESTAMP(3),
    ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
