-- Coordenador (00): schema mínimo para destravar o handoff bloqueador
-- .agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md (opt-out unificado
-- e-mail/WhatsApp/voz). Só o item 1 da proposta completa do Agente 17
-- (.agents/handoffs/onda-7/17-para-01-schema-cadencia-optout-proposta.md) — os outros 4 itens
-- (cadência multicanal, reply tracking, agendamento, proposta/assinatura) ficam para quem
-- assumir o resto daquele handoff.
--
-- CallSuppression (model já em produção, voz apenas) continua existindo e sendo escrito pelo
-- Agente 12 até ele confirmar a migração de leitura para OptOutRecord (decisão dele, não desta
-- migration) — ver "Coordenação obrigatória com o 12" na proposta original. Aqui só copiamos os
-- dados existentes para o novo registro unificado, sem apagar/alterar CallSuppression.

-- CreateEnum
CREATE TYPE "OptOutScope" AS ENUM ('Email', 'WhatsApp', 'Voice', 'Global');

-- CreateTable
CREATE TABLE "OptOutRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" "OptOutScope" NOT NULL,
    "leadId" TEXT,
    "email" TEXT,
    "phoneE164" TEXT,
    "originChannel" TEXT NOT NULL,
    "reason" TEXT,
    "evidence" TEXT,
    "requestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptOutRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OptOutRecord_organizationId_leadId_idx" ON "OptOutRecord"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "OptOutRecord_organizationId_phoneE164_idx" ON "OptOutRecord"("organizationId", "phoneE164");

-- CreateIndex
CREATE INDEX "OptOutRecord_organizationId_email_idx" ON "OptOutRecord"("organizationId", "email");

-- AddForeignKey
ALTER TABLE "OptOutRecord" ADD CONSTRAINT "OptOutRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptOutRecord" ADD CONSTRAINT "OptOutRecord_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: todo bloqueio de voz já registrado em CallSuppression entra também no registro
-- unificado, com scope='Voice' e originChannel='voice' — para que um opt-out feito por voz já
-- comece bloqueando os outros canais assim que 05/06 ligarem a consulta, sem esperar o lead pedir
-- de novo.
INSERT INTO "OptOutRecord" ("id", "organizationId", "scope", "leadId", "phoneE164", "originChannel", "reason", "createdAt")
SELECT gen_random_uuid()::text, "organizationId", 'Voice', "leadId", "phoneE164", 'voice', "reason", "createdAt"
FROM "CallSuppression";

-- RLS: mesmo padrão de tenant_isolation_policy usado em toda a base (ver 20260815020000_bitrix_extraction_run
-- para o precedente mais recente do mesmo motivo). WITH CHECK(true) porque os três canais (e-mail,
-- WhatsApp worker, voz) podem gravar um opt-out fora do ciclo normal de request HTTP (webhook,
-- worker BullMQ) — a defesa real é a aplicação sempre gravar organizationId a partir do tenant que
-- capturou o evento, nunca aceito de payload externo sem validação.
ALTER TABLE "OptOutRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OptOutRecord" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "OptOutRecord" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);
