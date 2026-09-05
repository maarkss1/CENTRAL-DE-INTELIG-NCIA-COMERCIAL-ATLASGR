-- Copiloto Comercial IA (Onda 4/7) — writeback no Bitrix24 para entityType COMPANY/CONTACT exige
-- saber qual registro do Bitrix corresponde a qual Company/Contact local. Mesmo raciocínio de
-- Lead.bitrixLeadId/Lead.bitrixDealId: só populado hoje quando o registro nasce da importação de
-- um Negócio do Bitrix24 (crm.deal.get -> COMPANY_ID/CONTACT_ID, ver
-- src/features/integrations/bitrix/service/deals.ts).
--
-- Sem constraint de unicidade (ao contrário de Lead.bitrixLeadId/bitrixDealId): cada Negócio
-- importado hoje cria uma Company/Contact NOVOS, sem dedupe entre Negócios do mesmo cliente
-- (problema pré-existente, não resolvido nesta migration) — duas linhas locais podem
-- legitimamente apontar para o mesmo bitrixCompanyId/bitrixContactId. Um índice único quebraria
-- a importação de um segundo Negócio da mesma empresa/contato.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "bitrixCompanyId" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "bitrixContactId" TEXT;

-- CreateIndex
CREATE INDEX "Company_bitrixCompanyId_idx" ON "Company"("bitrixCompanyId");

-- CreateIndex
CREATE INDEX "Contact_bitrixContactId_idx" ON "Contact"("bitrixContactId");
