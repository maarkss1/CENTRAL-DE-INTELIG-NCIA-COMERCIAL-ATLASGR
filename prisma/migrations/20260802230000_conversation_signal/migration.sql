-- Sinal de intenção extraído por IA de janelas de mensagens de WhatsApp já persistidas em
-- WhatsAppMessage. Não duplica o conteúdo da conversa — só o resultado estruturado da leitura
-- (intenção, urgência, objeções, próximo passo), gerado por um worker assíncrono.

CREATE TABLE "ConversationSignal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "intent" TEXT,
    "urgency" TEXT,
    "objections" TEXT[],
    "budgetMentioned" BOOLEAN NOT NULL DEFAULT false,
    "nextStep" TEXT,
    "summary" TEXT,
    "confidence" DOUBLE PRECISION,
    "rawModelOutput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConversationSignal_organizationId_leadId_createdAt_idx" ON "ConversationSignal"("organizationId", "leadId", "createdAt");

ALTER TABLE "ConversationSignal"
    ADD CONSTRAINT "ConversationSignal_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationSignal"
    ADD CONSTRAINT "ConversationSignal_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
