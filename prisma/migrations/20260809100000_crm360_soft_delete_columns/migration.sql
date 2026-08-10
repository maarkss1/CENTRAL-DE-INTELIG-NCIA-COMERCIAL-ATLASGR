-- src/lib/prisma.ts já lista CrmPipeline, CrmProduct, CrmDealItem e CrmCommercialDocument em
-- `auditableModels` (mesmo tratamento de soft-delete/auditoria de Company/Contact/Lead/Activity)
-- desde a introdução do CRM 360 (ver migration 20260808183000_crm_suite_parity), mas as colunas
-- deletedAt/deletedBy/deleteReason nunca foram criadas para essas 4 tabelas — a extensão do
-- Prisma injeta incondicionalmente `deletedAt: null` em todo SELECT desses models
-- (`isAuditable` em src/lib/prisma.ts:139-144), o que faz QUALQUER query nessas 4 tabelas falhar
-- com "Unknown argument `deletedAt`" desde sempre. Como nenhuma tela do produto ainda chama essas
-- rotas (funil "Negocio" era inalcançável pela UI até esta rodada de correções), o bug nunca foi
-- observado em uso real. Esta migration alinha o schema com o que o código já assume.

ALTER TABLE "CrmPipeline" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "CrmPipeline" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "CrmPipeline" ADD COLUMN "deleteReason" TEXT;

ALTER TABLE "CrmProduct" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "CrmProduct" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "CrmProduct" ADD COLUMN "deleteReason" TEXT;

ALTER TABLE "CrmDealItem" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "CrmDealItem" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "CrmDealItem" ADD COLUMN "deleteReason" TEXT;

ALTER TABLE "CrmCommercialDocument" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "CrmCommercialDocument" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "CrmCommercialDocument" ADD COLUMN "deleteReason" TEXT;
