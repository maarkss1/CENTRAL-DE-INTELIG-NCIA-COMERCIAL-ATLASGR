-- Persistência real de mensagens do WhatsApp (Baileys). Antes, o handler `messages.upsert` de
-- whatsapp.service.ts descartava tudo — nenhuma mensagem recebida (ou enviada) ficava registrada
-- em lugar nenhum, mesmo com a sessão/reconexão/envio já sendo reais.

CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "body" TEXT,
    "contactId" TEXT,
    "leadId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- Idempotência: o Baileys reentrega o mesmo evento após reconexão.
CREATE UNIQUE INDEX "WhatsAppMessage_organizationId_waMessageId_key"
    ON "WhatsAppMessage"("organizationId", "waMessageId");

CREATE INDEX "WhatsAppMessage_organizationId_phoneE164_idx" ON "WhatsAppMessage"("organizationId", "phoneE164");
CREATE INDEX "WhatsAppMessage_leadId_idx" ON "WhatsAppMessage"("leadId");

ALTER TABLE "WhatsAppMessage"
    ADD CONSTRAINT "WhatsAppMessage_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage"
    ADD CONSTRAINT "WhatsAppMessage_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage"
    ADD CONSTRAINT "WhatsAppMessage_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS no mesmo padrão das demais tabelas com tenant.
ALTER TABLE "WhatsAppMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppMessage" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "WhatsAppMessage" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
