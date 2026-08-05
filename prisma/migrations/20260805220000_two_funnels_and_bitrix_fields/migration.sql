-- Dois funis (Lead x Negócio) espelhando os dois objetos do Bitrix24, mais os campos comerciais
-- que hoje só existem lá (etapa da cadência, motivo de perda, pacote, status do negócio, nível de
-- relacionamento, comissão/parceiro, data de retomada, validação do AM).
--
-- LeadStatus troca de 8 valores genéricos para as 18 etapas reais (6 do funil Lead + 12 do funil
-- Negócio) — os valores antigos são remapeados para o equivalente mais próximo no novo conjunto
-- (ver CASE abaixo) em vez de simplesmente descartados, preservando os 18 leads já existentes.

-- CreateEnum
CREATE TYPE "LeadFunnel" AS ENUM ('Lead', 'Negocio');

-- AlterEnum (com remapeamento de dados — não é um simples rename)
BEGIN;
CREATE TYPE "LeadStatus_new" AS ENUM ('Lead Recebido', 'Cadência Iniciada', 'Qualificação (SDR)', 'Reunião Agendada', 'Convertido em Oportunidade', 'Lead Desqualificado', 'Nova Oportunidade', 'Proposta Enviada', 'Call/Visita Agendada', 'Piloto VTECH', 'Piloto Atlas Profile', 'Piloto Atlas Profile - Concluído', 'Piloto Atlas Profile - Cancelado', 'Piloto Logística', 'Piloto Logístico - Concluído', 'Piloto Logístico - Cancelado', 'Negócios Ganhos', 'Negócios Perdidos');

ALTER TABLE "public"."Lead" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Lead" ALTER COLUMN "status" TYPE "LeadStatus_new" USING (
  CASE "status"::text
    WHEN 'Novo Lead'        THEN 'Lead Recebido'
    WHEN 'Qualificação'     THEN 'Qualificação (SDR)'
    WHEN 'Primeiro Contato' THEN 'Reunião Agendada'
    WHEN 'Diagnóstico'      THEN 'Nova Oportunidade'
    WHEN 'Proposta'         THEN 'Proposta Enviada'
    WHEN 'Negociação'       THEN 'Call/Visita Agendada'
    WHEN 'Fechado Ganho'    THEN 'Negócios Ganhos'
    WHEN 'Fechado Perdido'  THEN 'Negócios Perdidos'
    ELSE 'Lead Recebido'
  END::"LeadStatus_new"
);

ALTER TYPE "LeadStatus" RENAME TO "LeadStatus_old";
ALTER TYPE "LeadStatus_new" RENAME TO "LeadStatus";
DROP TYPE "public"."LeadStatus_old";
ALTER TABLE "Lead" ALTER COLUMN "status" SET DEFAULT 'Lead Recebido';
COMMIT;

-- AlterTable (só os campos novos — NÃO mexe em colunas pré-existentes fora do escopo desta mudança)
ALTER TABLE "Lead"
  ADD COLUMN     "funnel" "LeadFunnel" NOT NULL DEFAULT 'Lead',
  ADD COLUMN     "resumeDate" TIMESTAMP(3),
  ADD COLUMN     "cadenceStage" TEXT,
  ADD COLUMN     "lossReason" TEXT,
  ADD COLUMN     "dealPackage" TEXT,
  ADD COLUMN     "dealStatus" TEXT,
  ADD COLUMN     "relationshipLevel" TEXT,
  ADD COLUMN     "commissionPercent" TEXT,
  ADD COLUMN     "partnerBroker" TEXT,
  ADD COLUMN     "qualificationValidatedByAM" BOOLEAN;

-- Leads que já estavam em etapas remapeadas para o funil Negócio (Diagnóstico/Proposta/Negociação/
-- Fechado Ganho/Fechado Perdido) precisam também mudar de `funnel`, senão ficariam com status de
-- Negócio só visível no board de Lead (que não reconhece essas etapas).
UPDATE "Lead" SET "funnel" = 'Negocio' WHERE "status" IN (
  'Nova Oportunidade', 'Proposta Enviada', 'Call/Visita Agendada', 'Piloto VTECH',
  'Piloto Atlas Profile', 'Piloto Atlas Profile - Concluído', 'Piloto Atlas Profile - Cancelado',
  'Piloto Logística', 'Piloto Logístico - Concluído', 'Piloto Logístico - Cancelado',
  'Negócios Ganhos', 'Negócios Perdidos'
);

-- CreateIndex
CREATE INDEX "Lead_organizationId_funnel_idx" ON "Lead"("organizationId", "funnel");
