-- ProspectRejection — candidato de descoberta ("Motor de Busca Turbo") marcado como "Não é esse
-- perfil" pelo vendedor (ver comentário completo em prisma/schema.prisma, acima do model). Sem
-- isso, um candidato descartado manualmente continuava reaparecendo em buscas futuras, porque a
-- única exclusão conhecida era a de empresas já promovidas a Company.
CREATE TABLE "ProspectRejection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "website" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectRejection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProspectRejection_organizationId_idx" ON "ProspectRejection"("organizationId");

ALTER TABLE "ProspectRejection"
    ADD CONSTRAINT "ProspectRejection_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS — mesmo padrão das migrations 20260722020322_enable_rls / 20260810120000 (ver esses
-- arquivos para o racional completo). Tabela com organizationId próprio, então usa o padrão
-- direto (mesmo formato de CommercialGoal/LeadStageHistory).
ALTER TABLE "ProspectRejection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectRejection" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "ProspectRejection" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
)
WITH CHECK (true);
