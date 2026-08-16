-- Onda 10, Agente 01A: aplica os itens 2-5 da proposta completa do Agente 17 em
-- .agents/handoffs/onda-7/17-para-01-schema-cadencia-optout-proposta.md (item 1, OptOutRecord,
-- já estava em produção antes desta migration — ver 20260815120000_opt_out_record).
--
-- Item 2: cadência multicanal (CadenceSequence/CadenceRun/CadenceTouchAttempt).
-- Item 3: reply tracking de e-mail (coluna ConversationSignal.channel + tabela EmailMessage).
-- Item 4: agendamento (CadenceCalendarEvent).
-- Item 5: proposta versionada + assinatura + fechamento determinístico
--         (CrmCommercialDocumentVersion/CrmDocumentSignatureRequest/DealClosureEvent).
--
-- Duas diferenças em relação ao SQL literal do handoff do 17 (ver nota completa em
-- prisma/schema.prisma, acima dos models desta seção):
-- 1. Toda tabela nova ganhou a FK "organizationId" -> "Organization" que o handoff listava a
--    coluna mas não a constraint (lacuna de transcrição, não decisão de omitir — a proposta
--    promete esse padrão no parágrafo de abertura).
-- 2. "CadenceRun_leadId_active_unique" é criado como índice único PARCIAL
--    (WHERE "status" = 'Active'), exatamente como o handoff propôs — não representável na DSL do
--    Prisma, por isso não aparece em schema.prisma como @@unique, só este SQL manual.

-- ─── Item 2: Cadência multicanal ────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "CadenceChannel" AS ENUM ('Email', 'WhatsApp', 'Voice');
CREATE TYPE "CadenceRunStatus" AS ENUM ('Active', 'Paused', 'Stopped');
CREATE TYPE "CadenceStopReason" AS ENUM ('OptOut', 'LeadReply', 'Completed', 'ManualStop');
CREATE TYPE "CadenceTouchResult" AS ENUM ('Sent', 'Failed', 'Skipped');

-- CreateTable
CREATE TABLE "CadenceSequence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "touches" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CadenceSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CadenceSequence_organizationId_active_idx" ON "CadenceSequence"("organizationId", "active");

-- AddForeignKey
ALTER TABLE "CadenceSequence" ADD CONSTRAINT "CadenceSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "CadenceRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "status" "CadenceRunStatus" NOT NULL DEFAULT 'Active',
    "currentTouchOrder" INTEGER NOT NULL DEFAULT 1,
    "stopReason" "CadenceStopReason",
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTouchAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CadenceRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CadenceRun_organizationId_status_idx" ON "CadenceRun"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CadenceRun_leadId_idx" ON "CadenceRun"("leadId");

-- CreateIndex: índice único PARCIAL — um lead nunca tem duas cadências ativas simultâneas
-- concorrendo pelo mesmo canal (ver regra de negócio em src/features/cadence/domain/cadence.ts).
-- NULL/valores com status != 'Active' não entram na checagem de unicidade.
CREATE UNIQUE INDEX "CadenceRun_leadId_active_unique" ON "CadenceRun"("leadId") WHERE "status" = 'Active';

-- AddForeignKey
ALTER TABLE "CadenceRun" ADD CONSTRAINT "CadenceRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CadenceRun" ADD CONSTRAINT "CadenceRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CadenceRun" ADD CONSTRAINT "CadenceRun_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "CadenceSequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "CadenceTouchAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cadenceRunId" TEXT NOT NULL,
    "touchOrder" INTEGER NOT NULL,
    "channel" "CadenceChannel" NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "CadenceTouchResult" NOT NULL,
    "skipReason" TEXT,
    "error" TEXT,
    "providerMessageId" TEXT,

    CONSTRAINT "CadenceTouchAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CadenceTouchAttempt_organizationId_idx" ON "CadenceTouchAttempt"("organizationId");

-- CreateIndex
CREATE INDEX "CadenceTouchAttempt_cadenceRunId_idx" ON "CadenceTouchAttempt"("cadenceRunId");

-- AddForeignKey
ALTER TABLE "CadenceTouchAttempt" ADD CONSTRAINT "CadenceTouchAttempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CadenceTouchAttempt" ADD CONSTRAINT "CadenceTouchAttempt_cadenceRunId_fkey" FOREIGN KEY ("cadenceRunId") REFERENCES "CadenceRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: mesmo padrão de tenant_isolation_policy usado em toda a base (ver 20260815120000_opt_out_record
-- para o precedente mais recente). WITH CHECK(true) pelo mesmo motivo documentado nas migrations
-- anteriores: workers assíncronos (BullMQ) podem gravar fora do ciclo normal de request HTTP — a
-- defesa real é a aplicação sempre gravar organizationId a partir do tenant que disparou a ação,
-- nunca aceito de payload externo sem validação.
ALTER TABLE "CadenceSequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CadenceSequence" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "CadenceSequence" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

ALTER TABLE "CadenceRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CadenceRun" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "CadenceRun" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

ALTER TABLE "CadenceTouchAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CadenceTouchAttempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "CadenceTouchAttempt" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- ─── Item 3: Reply tracking de e-mail ───────────────────────────────────────────────────────

-- AlterTable: canal ficava implícito como "sempre WhatsApp" — agora explícito, com default que
-- preserva a leitura de todo sinal histórico já gravado antes desta coluna existir.
ALTER TABLE "ConversationSignal" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'whatsapp';

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "inReplyTo" TEXT,
    "direction" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "leadId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_organizationId_providerMessageId_key" ON "EmailMessage"("organizationId", "providerMessageId");

-- CreateIndex
CREATE INDEX "EmailMessage_leadId_idx" ON "EmailMessage"("leadId");

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "EmailMessage" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- ─── Item 4: Agendamento ────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "ConfirmationEvidenceType" AS ENUM ('LeadCalendarReply', 'LeadSchedulingLinkClick', 'ManualVerified');

-- CreateTable
CREATE TABLE "CadenceCalendarEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "cadenceRunId" TEXT,
    "googleEventId" TEXT,
    "confirmationEvidenceType" "ConfirmationEvidenceType" NOT NULL,
    "confirmationEvidenceRef" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CadenceCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CadenceCalendarEvent_leadId_idx" ON "CadenceCalendarEvent"("leadId");

-- CreateIndex
CREATE INDEX "CadenceCalendarEvent_organizationId_idx" ON "CadenceCalendarEvent"("organizationId");

-- AddForeignKey
ALTER TABLE "CadenceCalendarEvent" ADD CONSTRAINT "CadenceCalendarEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CadenceCalendarEvent" ADD CONSTRAINT "CadenceCalendarEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CadenceCalendarEvent" ADD CONSTRAINT "CadenceCalendarEvent_cadenceRunId_fkey" FOREIGN KEY ("cadenceRunId") REFERENCES "CadenceRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CadenceCalendarEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CadenceCalendarEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "CadenceCalendarEvent" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- ─── Item 5: Proposta versionada, assinatura e fechamento determinístico ───────────────────

-- CreateTable
CREATE TABLE "CrmCommercialDocumentVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedBy" TEXT,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmCommercialDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmCommercialDocumentVersion_documentId_versionNumber_key" ON "CrmCommercialDocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "CrmCommercialDocumentVersion_organizationId_idx" ON "CrmCommercialDocumentVersion"("organizationId");

-- AddForeignKey
ALTER TABLE "CrmCommercialDocumentVersion" ADD CONSTRAINT "CrmCommercialDocumentVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCommercialDocumentVersion" ADD CONSTRAINT "CrmCommercialDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CrmCommercialDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmCommercialDocumentVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CrmCommercialDocumentVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "CrmCommercialDocumentVersion" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- CreateEnum
CREATE TYPE "SignatureRequestStatus" AS ENUM ('Created', 'Sent', 'Viewed', 'Signed', 'Declined', 'Expired', 'Cancelled');

-- CreateTable
CREATE TABLE "CrmDocumentSignatureRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    -- Provedor fica livre (texto), não enum — decisão de negócio já tomada (2026-08-15):
    -- Assinatura Eletrônica gov.br (https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica).
    -- Valor real gravado é 'govbr'. Ver "## Decisão do usuário" no handoff original.
    "provider" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'Created',
    "signerEmail" TEXT NOT NULL,
    "signerName" TEXT,
    "requestedBy" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "evidenceRef" TEXT,
    "rawWebhookPayload" JSONB,

    CONSTRAINT "CrmDocumentSignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmDocumentSignatureRequest_documentId_idx" ON "CrmDocumentSignatureRequest"("documentId");

-- CreateIndex
CREATE INDEX "CrmDocumentSignatureRequest_organizationId_idx" ON "CrmDocumentSignatureRequest"("organizationId");

-- AddForeignKey
ALTER TABLE "CrmDocumentSignatureRequest" ADD CONSTRAINT "CrmDocumentSignatureRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmDocumentSignatureRequest" ADD CONSTRAINT "CrmDocumentSignatureRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CrmCommercialDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmDocumentSignatureRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CrmDocumentSignatureRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "CrmDocumentSignatureRequest" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);

-- CreateEnum
CREATE TYPE "DealClosureEventType" AS ENUM ('SignatureCompleted', 'PaymentConfirmed', 'ManualCrmConfirmation');

-- CreateTable: ledger append-only do que moveu um Lead/Negócio para "Negócios Ganhos" — ver
-- .agents/handoffs/onda-7/17-para-13-evento-fechamento.md para o acordo do que conta como evento
-- válido.
CREATE TABLE "DealClosureEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "DealClosureEventType" NOT NULL,
    "evidenceRef" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "previousStatus" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealClosureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealClosureEvent_leadId_idx" ON "DealClosureEvent"("leadId");

-- CreateIndex
CREATE INDEX "DealClosureEvent_organizationId_idx" ON "DealClosureEvent"("organizationId");

-- AddForeignKey
ALTER TABLE "DealClosureEvent" ADD CONSTRAINT "DealClosureEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealClosureEvent" ADD CONSTRAINT "DealClosureEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DealClosureEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealClosureEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "DealClosureEvent" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);
