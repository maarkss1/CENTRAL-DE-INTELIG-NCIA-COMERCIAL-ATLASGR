-- AI-006 (onda 35): tabela nova para o sinal real de "PII leakage rate" do harness de avaliação —
-- um evento por vez que `redactSensitiveData` (guardrails.service.ts) de fato mascarou um CPF numa
-- resposta de IA antes de ela chegar ao usuário. Sempre escrito de dentro de uma requisição
-- autenticada (authenticateToken + requireTenant já rodaram nas 4 rotas que chamam o guardrail),
-- então organizationId é sempre conhecido — RLS simples, sem o caso NULL que AILog precisa tratar.

CREATE TABLE "AIGuardrailEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIGuardrailEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AIGuardrailEvent_organizationId_type_createdAt_idx" ON "AIGuardrailEvent"("organizationId", "type", "createdAt");

ALTER TABLE "AIGuardrailEvent" ADD CONSTRAINT "AIGuardrailEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS no mesmo padrão simples de Automation/Notification (organizationId sempre não-nulo).
ALTER TABLE "AIGuardrailEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AIGuardrailEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "AIGuardrailEvent" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
