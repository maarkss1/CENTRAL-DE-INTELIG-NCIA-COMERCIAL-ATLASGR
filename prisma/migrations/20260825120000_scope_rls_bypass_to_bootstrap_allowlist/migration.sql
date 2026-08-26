-- ITEM-02 (remediacao de divida tecnica, P0): reduz o raio de explosao do bypass de RLS
-- generico e fecha uma janela de escrita cross-tenant real (WITH CHECK (true)) nas tabelas
-- de negocio que NAO fazem parte do allowlist de bootstrap legitimo (BYPASS_RLS_ALLOWED_MODELS
-- em src/lib/prisma.ts: User/Organization/Session/Account/Verification/BitrixConnection/
-- FeatureFlag/CadenceRun/CadenceSequence/Lead/CrmCommercialDocument/
-- CrmDocumentSignatureRequest/AILog).
--
-- Problema real confirmado (nao teorico) contra Postgres real, com a role prospector_app
-- (NOSUPERUSER, sem BYPASSRLS) sem nenhum bypass ativo: a clausula `OR
-- current_setting('app.bypass_rls', TRUE) = 'on'` esta presente na policy de FORCE ROW LEVEL
-- SECURITY de ~50 tabelas, tornando qualquer futuro bug/uso indevido do bypass (JS, raw SQL
-- via withRlsContext, ou script novo) capaz de ler/escrever QUALQUER tabela com esse padrao,
-- nao so os models explicitamente permitidos pelo allowlist da extensao Prisma. Alem disso,
-- boa parte dessas mesmas tabelas tinha `WITH CHECK (true)` (INSERT/UPDATE irrestrito, SEM
-- exigir bypass nenhum) -- reproduzido ao vivo: com app.current_tenant_id='org-a' e SEM
-- bypass, a role prospector_app conseguia INSERT um Prompt com organizationId='org-b', e o
-- tenant B via essa linha como se fosse dado legitimo dele. Essa migration:
--   1. Remove a clausula de bypass do USING (leitura/alvo de UPDATE-DELETE) nas tabelas fora
--      do allowlist -- nenhum bug/raw SQL futuro pode mais usar bypass_rls para ler essas
--      tabelas cross-tenant.
--   2. Substitui WITH CHECK (true)/ausente por um WITH CHECK que exige exatamente o mesmo
--      match de tenant do USING (sem excecao de bypass) -- fecha a escrita cross-tenant
--      confirmada acima, para toda tabela fora do allowlist.
-- As tabelas do allowlist (Organization/user/session/account/verification/BitrixConnection/
-- FeatureFlag/CadenceRun/CadenceSequence/Lead/CrmCommercialDocument/
-- CrmDocumentSignatureRequest/AILog) NAO sao tocadas aqui -- continuam com o bypass
-- deliberado e documentado que ja tinham (motivo de cada uma em src/lib/prisma.ts).
--
-- Idempotente (DROP POLICY IF EXISTS + CREATE POLICY), mesmo padrao ja usado em
-- 20260807100000_enable_rls_remaining_tables. Nao apaga nem move dado nenhum -- so aperta a
-- policy de RLS. AIEvaluation/AiEngineSetting/MarketIntelligence(Company|Dataset|
-- MunicipalityMapping) ficam fora desta migration por motivo proprio, documentado no PR:
-- AIEvaluation ja e bypass-only e nao esta no allowlist (fica inacessivel em producao mesmo
-- sem mudanca aqui); AiEngineSetting e config global sem organizationId (nao ha tenant pra
-- isolar); MarketIntelligence* usa duas policies (leitura compartilhada entre tenants por
-- desenho + escrita ja bypass-only) que ja nao tem o problema desta migration.

DROP POLICY IF EXISTS tenant_isolation_policy ON "AIGuardrailEvent";
CREATE POLICY tenant_isolation_policy ON "AIGuardrailEvent" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "AIPendingAction";
CREATE POLICY tenant_isolation_policy ON "AIPendingAction" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "AccountIntelligenceSnapshot";
CREATE POLICY tenant_isolation_policy ON "AccountIntelligenceSnapshot" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "AccountRecommendation";
CREATE POLICY tenant_isolation_policy ON "AccountRecommendation" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "AccountScore";
CREATE POLICY tenant_isolation_policy ON "AccountScore" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "AccountSignal";
CREATE POLICY tenant_isolation_policy ON "AccountSignal" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "Activity";
CREATE POLICY tenant_isolation_policy ON "Activity" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "AgentMemory";
CREATE POLICY tenant_isolation_policy ON "AgentMemory" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "AssistantMessage";
CREATE POLICY tenant_isolation_policy ON "AssistantMessage" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "Automation";
CREATE POLICY tenant_isolation_policy ON "Automation" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "BitrixExtractionRun";
CREATE POLICY tenant_isolation_policy ON "BitrixExtractionRun" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "BitrixSyncLog";
CREATE POLICY tenant_isolation_policy ON "BitrixSyncLog" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "BitrixSyncRule";
CREATE POLICY tenant_isolation_policy ON "BitrixSyncRule" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "BugReport";
CREATE POLICY tenant_isolation_policy ON "BugReport" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "CadenceCalendarEvent";
CREATE POLICY tenant_isolation_policy ON "CadenceCalendarEvent" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "CadenceTouchAttempt";
CREATE POLICY tenant_isolation_policy ON "CadenceTouchAttempt" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "CallSuppression";
CREATE POLICY tenant_isolation_policy ON "CallSuppression" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "ColdCallRun";
CREATE POLICY tenant_isolation_policy ON "ColdCallRun" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "CommercialGoal";
CREATE POLICY tenant_isolation_policy ON "CommercialGoal" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "Company";
CREATE POLICY tenant_isolation_policy ON "Company" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "Contact";
CREATE POLICY tenant_isolation_policy ON "Contact" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "ConversationSignal";
CREATE POLICY tenant_isolation_policy ON "ConversationSignal" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "CrmCommercialDocumentVersion";
CREATE POLICY tenant_isolation_policy ON "CrmCommercialDocumentVersion" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "CrmDealItem";
CREATE POLICY tenant_isolation_policy ON "CrmDealItem" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "CrmPipeline";
CREATE POLICY tenant_isolation_policy ON "CrmPipeline" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "CrmProduct";
CREATE POLICY tenant_isolation_policy ON "CrmProduct" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "DealClosureEvent";
CREATE POLICY tenant_isolation_policy ON "DealClosureEvent" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "DecisionMaker";
CREATE POLICY tenant_isolation_policy ON "DecisionMaker" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "Document";
CREATE POLICY tenant_isolation_policy ON "Document" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "EconomicRelationship";
CREATE POLICY tenant_isolation_policy ON "EconomicRelationship" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "EmailMessage";
CREATE POLICY tenant_isolation_policy ON "EmailMessage" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "GoogleWorkspaceConnection";
CREATE POLICY tenant_isolation_policy ON "GoogleWorkspaceConnection" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "IntelligenceEvidence";
CREATE POLICY tenant_isolation_policy ON "IntelligenceEvidence" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "KnowledgeChunk";
CREATE POLICY tenant_isolation_policy ON "KnowledgeChunk" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "LeadStageHistory";
CREATE POLICY tenant_isolation_policy ON "LeadStageHistory" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "MarketIntelligenceEconomicScenario";
CREATE POLICY tenant_isolation_policy ON "MarketIntelligenceEconomicScenario" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "Notification";
CREATE POLICY tenant_isolation_policy ON "Notification" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "ObjectionMatrixItem";
CREATE POLICY tenant_isolation_policy ON "ObjectionMatrixItem" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "OptOutRecord";
CREATE POLICY tenant_isolation_policy ON "OptOutRecord" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "OrganizationFeatureFlag";
CREATE POLICY tenant_isolation_policy ON "OrganizationFeatureFlag" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "Prompt";
CREATE POLICY tenant_isolation_policy ON "Prompt" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "Prospect";
CREATE POLICY tenant_isolation_policy ON "Prospect" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "ProspectRejection";
CREATE POLICY tenant_isolation_policy ON "ProspectRejection" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "QualificationMatrixItem";
CREATE POLICY tenant_isolation_policy ON "QualificationMatrixItem" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "Report";
CREATE POLICY tenant_isolation_policy ON "Report" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "ThreeCXConnection";
CREATE POLICY tenant_isolation_policy ON "ThreeCXConnection" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "WhatsAppMessage";
CREATE POLICY tenant_isolation_policy ON "WhatsAppMessage" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "AIGovernancePolicy";
CREATE POLICY tenant_isolation_policy ON "AIGovernancePolicy" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "tenantId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "tenantId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "AuditLog";
CREATE POLICY tenant_isolation_policy ON "AuditLog" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "tenantId"
)
WITH CHECK (
    current_setting('app.current_tenant_id', TRUE) = "tenantId"
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "Note";
CREATE POLICY tenant_isolation_policy ON "Note" FOR ALL
USING (
    "leadId" IN (
        SELECT id FROM "Lead"
        WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)
    )
)
WITH CHECK (
    "leadId" IN (
        SELECT id FROM "Lead"
        WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)
    )
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "TimelineEvent";
CREATE POLICY tenant_isolation_policy ON "TimelineEvent" FOR ALL
USING (
    "leadId" IN (
        SELECT id FROM "Lead"
        WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)
    )
)
WITH CHECK (
    "leadId" IN (
        SELECT id FROM "Lead"
        WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)
    )
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "EnrichmentLog";
CREATE POLICY tenant_isolation_policy ON "EnrichmentLog" FOR ALL
USING (
    "companyId" IN (
        SELECT id FROM "Company"
        WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)
    )
)
WITH CHECK (
    "companyId" IN (
        SELECT id FROM "Company"
        WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)
    )
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "CrmPipelineStage";
CREATE POLICY tenant_isolation_policy ON "CrmPipelineStage" FOR ALL
USING (
    "pipelineId" IN (
        SELECT id FROM "CrmPipeline"
        WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)
    )
)
WITH CHECK (
    "pipelineId" IN (
        SELECT id FROM "CrmPipeline"
        WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)
    )
);

DROP POLICY IF EXISTS tenant_isolation_policy ON "DocumentChunk";
CREATE POLICY tenant_isolation_policy ON "DocumentChunk" FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM "Document" d
        WHERE d.id = "DocumentChunk"."documentId"
        AND current_setting('app.current_tenant_id', TRUE) = d."organizationId"
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM "Document" d
        WHERE d.id = "DocumentChunk"."documentId"
        AND current_setting('app.current_tenant_id', TRUE) = d."organizationId"
    )
);

