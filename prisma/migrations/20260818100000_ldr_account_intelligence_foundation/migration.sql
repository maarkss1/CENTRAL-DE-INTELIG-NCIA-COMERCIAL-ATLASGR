-- Fase 1 do LDR / Account Intelligence: fundacao persistente ligada a Company/Contact reais.
-- Nenhuma tabela abaixo e global: todas carregam organizationId obrigatorio, FK composta para a
-- Company do mesmo tenant e RLS fail-closed tanto para leitura quanto para escrita.

-- CreateEnum
CREATE TYPE "IntelligenceEvidenceType" AS ENUM ('FACT', 'INFERENCE', 'RECOMMENDATION');
CREATE TYPE "IntelligenceSnapshotStatus" AS ENUM ('Complete', 'Partial', 'Failed', 'Stale');
CREATE TYPE "AccountSignalStatus" AS ENUM ('Active', 'Dismissed', 'Expired');
CREATE TYPE "DecisionMakerStatus" AS ENUM ('Active', 'Inactive', 'Unverified');
CREATE TYPE "AccountRecommendationStatus" AS ENUM ('Pending', 'Approved', 'Executed', 'Dismissed', 'Superseded', 'Failed');
CREATE TYPE "EconomicRelationshipStatus" AS ENUM ('Verified', 'Inferred', 'Rejected', 'Inactive');

-- Chaves candidatas compostas usadas para impedir referencias cross-tenant mesmo quando uma
-- operacao administrativa roda com app.bypass_rls='on'. id continua sendo a PK canonica.
CREATE UNIQUE INDEX "Company_id_organizationId_key" ON "Company"("id", "organizationId");
CREATE UNIQUE INDEX "Contact_id_companyId_organizationId_key" ON "Contact"("id", "companyId", "organizationId");

CREATE TABLE "AccountIntelligenceSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "summary" TEXT NOT NULL,
    "structuredFacts" JSONB NOT NULL,
    "sourceStatus" JSONB NOT NULL,
    "status" "IntelligenceSnapshotStatus" NOT NULL DEFAULT 'Partial',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountIntelligenceSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountIntelligenceSnapshot_version_positive" CHECK ("version" > 0),
    CONSTRAINT "AccountIntelligenceSnapshot_expiry_after_generation" CHECK ("expiresAt" IS NULL OR "expiresAt" > "generatedAt")
);

CREATE UNIQUE INDEX "AccountIntelligenceSnapshot_organizationId_companyId_version_key"
    ON "AccountIntelligenceSnapshot"("organizationId", "companyId", "version");
CREATE UNIQUE INDEX "AccountIntelligenceSnapshot_id_organizationId_companyId_key"
    ON "AccountIntelligenceSnapshot"("id", "organizationId", "companyId");
CREATE INDEX "AccountIntelligenceSnapshot_organizationId_companyId_generatedAt_idx"
    ON "AccountIntelligenceSnapshot"("organizationId", "companyId", "generatedAt" DESC);
CREATE INDEX "AccountIntelligenceSnapshot_organizationId_companyId_status_idx"
    ON "AccountIntelligenceSnapshot"("organizationId", "companyId", "status");
CREATE INDEX "AccountIntelligenceSnapshot_organizationId_expiresAt_idx"
    ON "AccountIntelligenceSnapshot"("organizationId", "expiresAt");

ALTER TABLE "AccountIntelligenceSnapshot"
    ADD CONSTRAINT "AccountIntelligenceSnapshot_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountIntelligenceSnapshot"
    ADD CONSTRAINT "AccountIntelligenceSnapshot_companyId_organizationId_fkey"
    FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccountSignal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "type" TEXT NOT NULL,
    "taxonomyVersion" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceType" "IntelligenceEvidenceType" NOT NULL,
    "status" "AccountSignalStatus" NOT NULL DEFAULT 'Active',
    "dedupeKey" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountSignal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountSignal_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 1),
    CONSTRAINT "AccountSignal_occurrence_positive" CHECK ("occurrenceCount" > 0),
    CONSTRAINT "AccountSignal_seen_order" CHECK ("lastSeenAt" >= "firstSeenAt"),
    CONSTRAINT "AccountSignal_not_recommendation" CHECK ("evidenceType" <> 'RECOMMENDATION')
);

CREATE UNIQUE INDEX "AccountSignal_organizationId_companyId_dedupeKey_key"
    ON "AccountSignal"("organizationId", "companyId", "dedupeKey");
CREATE INDEX "AccountSignal_organizationId_companyId_detectedAt_idx"
    ON "AccountSignal"("organizationId", "companyId", "detectedAt" DESC);
CREATE INDEX "AccountSignal_organizationId_companyId_type_status_idx"
    ON "AccountSignal"("organizationId", "companyId", "type", "status");
CREATE INDEX "AccountSignal_organizationId_status_lastSeenAt_idx"
    ON "AccountSignal"("organizationId", "status", "lastSeenAt" DESC);
CREATE INDEX "AccountSignal_snapshotId_idx" ON "AccountSignal"("snapshotId");

ALTER TABLE "AccountSignal"
    ADD CONSTRAINT "AccountSignal_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountSignal"
    ADD CONSTRAINT "AccountSignal_companyId_organizationId_fkey"
    FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountSignal"
    ADD CONSTRAINT "AccountSignal_snapshotId_organizationId_companyId_fkey"
    FOREIGN KEY ("snapshotId", "organizationId", "companyId") REFERENCES "AccountIntelligenceSnapshot"("id", "organizationId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DecisionMaker" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "buyingRole" TEXT NOT NULL,
    "department" TEXT,
    "seniority" TEXT,
    "roleEvidenceType" "IntelligenceEvidenceType" NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "DecisionMakerStatus" NOT NULL DEFAULT 'Unverified',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionMaker_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DecisionMaker_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 1),
    CONSTRAINT "DecisionMaker_not_recommendation" CHECK ("roleEvidenceType" <> 'RECOMMENDATION'),
    CONSTRAINT "DecisionMaker_active_requires_verification" CHECK ("status" <> 'Active' OR "verifiedAt" IS NOT NULL)
);

CREATE UNIQUE INDEX "DecisionMaker_organizationId_companyId_contactId_key"
    ON "DecisionMaker"("organizationId", "companyId", "contactId");
CREATE INDEX "DecisionMaker_organizationId_companyId_status_idx"
    ON "DecisionMaker"("organizationId", "companyId", "status");
CREATE INDEX "DecisionMaker_organizationId_companyId_buyingRole_idx"
    ON "DecisionMaker"("organizationId", "companyId", "buyingRole");
CREATE INDEX "DecisionMaker_snapshotId_idx" ON "DecisionMaker"("snapshotId");

ALTER TABLE "DecisionMaker"
    ADD CONSTRAINT "DecisionMaker_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionMaker"
    ADD CONSTRAINT "DecisionMaker_companyId_organizationId_fkey"
    FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionMaker"
    ADD CONSTRAINT "DecisionMaker_contactId_companyId_organizationId_fkey"
    FOREIGN KEY ("contactId", "companyId", "organizationId") REFERENCES "Contact"("id", "companyId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionMaker"
    ADD CONSTRAINT "DecisionMaker_snapshotId_organizationId_companyId_fkey"
    FOREIGN KEY ("snapshotId", "organizationId", "companyId") REFERENCES "AccountIntelligenceSnapshot"("id", "organizationId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "IntelligenceEvidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "factKey" TEXT NOT NULL,
    "value" JSONB,
    "valueHash" TEXT,
    "reference" TEXT,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION,
    "evidenceType" "IntelligenceEvidenceType" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntelligenceEvidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IntelligenceEvidence_confidence_range" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
    CONSTRAINT "IntelligenceEvidence_content_required" CHECK ("value" IS NOT NULL OR "valueHash" IS NOT NULL OR "reference" IS NOT NULL OR "sourceUrl" IS NOT NULL)
);

CREATE UNIQUE INDEX "IntelligenceEvidence_organizationId_companyId_dedupeKey_key"
    ON "IntelligenceEvidence"("organizationId", "companyId", "dedupeKey");
CREATE INDEX "IntelligenceEvidence_organizationId_companyId_collectedAt_idx"
    ON "IntelligenceEvidence"("organizationId", "companyId", "collectedAt" DESC);
CREATE INDEX "IntelligenceEvidence_organizationId_companyId_evidenceType_idx"
    ON "IntelligenceEvidence"("organizationId", "companyId", "evidenceType");
CREATE INDEX "IntelligenceEvidence_organizationId_subjectType_subjectId_idx"
    ON "IntelligenceEvidence"("organizationId", "subjectType", "subjectId");
CREATE INDEX "IntelligenceEvidence_snapshotId_idx" ON "IntelligenceEvidence"("snapshotId");

ALTER TABLE "IntelligenceEvidence"
    ADD CONSTRAINT "IntelligenceEvidence_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntelligenceEvidence"
    ADD CONSTRAINT "IntelligenceEvidence_companyId_organizationId_fkey"
    FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntelligenceEvidence"
    ADD CONSTRAINT "IntelligenceEvidence_snapshotId_organizationId_companyId_fkey"
    FOREIGN KEY ("snapshotId", "organizationId", "companyId") REFERENCES "AccountIntelligenceSnapshot"("id", "organizationId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AccountScore" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "fit" INTEGER NOT NULL,
    "timing" INTEGER NOT NULL,
    "intent" INTEGER NOT NULL,
    "relationship" INTEGER NOT NULL,
    "positiveReasons" TEXT[],
    "negativeReasons" TEXT[],
    "calculation" JSONB NOT NULL,
    "scoreVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountScore_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountScore_total_range" CHECK ("total" >= 0 AND "total" <= 100),
    CONSTRAINT "AccountScore_fit_range" CHECK ("fit" >= 0 AND "fit" <= 100),
    CONSTRAINT "AccountScore_timing_range" CHECK ("timing" >= 0 AND "timing" <= 100),
    CONSTRAINT "AccountScore_intent_range" CHECK ("intent" >= 0 AND "intent" <= 100),
    CONSTRAINT "AccountScore_relationship_range" CHECK ("relationship" >= 0 AND "relationship" <= 100)
);

CREATE UNIQUE INDEX "AccountScore_organizationId_companyId_scoreVersion_inputHash_key"
    ON "AccountScore"("organizationId", "companyId", "scoreVersion", "inputHash");
CREATE UNIQUE INDEX "AccountScore_id_organizationId_companyId_key"
    ON "AccountScore"("id", "organizationId", "companyId");
CREATE INDEX "AccountScore_organizationId_companyId_calculatedAt_idx"
    ON "AccountScore"("organizationId", "companyId", "calculatedAt" DESC);
CREATE INDEX "AccountScore_organizationId_total_calculatedAt_idx"
    ON "AccountScore"("organizationId", "total" DESC, "calculatedAt" DESC);
CREATE INDEX "AccountScore_snapshotId_idx" ON "AccountScore"("snapshotId");

ALTER TABLE "AccountScore"
    ADD CONSTRAINT "AccountScore_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountScore"
    ADD CONSTRAINT "AccountScore_companyId_organizationId_fkey"
    FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountScore"
    ADD CONSTRAINT "AccountScore_snapshotId_organizationId_companyId_fkey"
    FOREIGN KEY ("snapshotId", "organizationId", "companyId") REFERENCES "AccountIntelligenceSnapshot"("id", "organizationId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AccountRecommendation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "accountScoreId" TEXT,
    "actionType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "expectedImpact" TEXT,
    "status" "AccountRecommendationStatus" NOT NULL DEFAULT 'Pending',
    "recommendationVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "executedAt" TIMESTAMP(3),
    "externalRef" TEXT,
    "idempotencyKey" TEXT,
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountRecommendation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountRecommendation_priority_range" CHECK ("priority" >= 1 AND "priority" <= 5),
    CONSTRAINT "AccountRecommendation_executed_timestamp" CHECK ("status" <> 'Executed' OR "executedAt" IS NOT NULL)
);

CREATE UNIQUE INDEX "AccountRecommendation_organizationId_companyId_actionType_inputHash_key"
    ON "AccountRecommendation"("organizationId", "companyId", "actionType", "inputHash");
CREATE UNIQUE INDEX "AccountRecommendation_organizationId_companyId_idempotencyKey_unique"
    ON "AccountRecommendation"("organizationId", "companyId", "idempotencyKey")
    WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX "AccountRecommendation_organizationId_companyId_status_generatedAt_idx"
    ON "AccountRecommendation"("organizationId", "companyId", "status", "generatedAt" DESC);
CREATE INDEX "AccountRecommendation_organizationId_status_priority_idx"
    ON "AccountRecommendation"("organizationId", "status", "priority");
CREATE INDEX "AccountRecommendation_snapshotId_idx" ON "AccountRecommendation"("snapshotId");
CREATE INDEX "AccountRecommendation_accountScoreId_idx" ON "AccountRecommendation"("accountScoreId");

ALTER TABLE "AccountRecommendation"
    ADD CONSTRAINT "AccountRecommendation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountRecommendation"
    ADD CONSTRAINT "AccountRecommendation_companyId_organizationId_fkey"
    FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountRecommendation"
    ADD CONSTRAINT "AccountRecommendation_snapshotId_organizationId_companyId_fkey"
    FOREIGN KEY ("snapshotId", "organizationId", "companyId") REFERENCES "AccountIntelligenceSnapshot"("id", "organizationId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountRecommendation"
    ADD CONSTRAINT "AccountRecommendation_accountScoreId_organizationId_companyId_fkey"
    FOREIGN KEY ("accountScoreId", "organizationId", "companyId") REFERENCES "AccountScore"("id", "organizationId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EconomicRelationship" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceCompanyId" TEXT NOT NULL,
    "targetCompanyId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "relationType" TEXT NOT NULL,
    "status" "EconomicRelationshipStatus" NOT NULL DEFAULT 'Inferred',
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomicRelationship_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EconomicRelationship_distinct_accounts" CHECK ("sourceCompanyId" <> "targetCompanyId"),
    CONSTRAINT "EconomicRelationship_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 1),
    CONSTRAINT "EconomicRelationship_verified_timestamp" CHECK ("status" <> 'Verified' OR "verifiedAt" IS NOT NULL),
    CONSTRAINT "EconomicRelationship_valid_period" CHECK ("validTo" IS NULL OR "validFrom" IS NULL OR "validTo" > "validFrom")
);

CREATE UNIQUE INDEX "EconomicRelationship_organizationId_dedupeKey_key"
    ON "EconomicRelationship"("organizationId", "dedupeKey");
CREATE INDEX "EconomicRelationship_organizationId_sourceCompanyId_status_idx"
    ON "EconomicRelationship"("organizationId", "sourceCompanyId", "status");
CREATE INDEX "EconomicRelationship_organizationId_targetCompanyId_status_idx"
    ON "EconomicRelationship"("organizationId", "targetCompanyId", "status");
CREATE INDEX "EconomicRelationship_organizationId_relationType_detectedAt_idx"
    ON "EconomicRelationship"("organizationId", "relationType", "detectedAt" DESC);
CREATE INDEX "EconomicRelationship_snapshotId_idx" ON "EconomicRelationship"("snapshotId");

ALTER TABLE "EconomicRelationship"
    ADD CONSTRAINT "EconomicRelationship_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EconomicRelationship"
    ADD CONSTRAINT "EconomicRelationship_sourceCompanyId_organizationId_fkey"
    FOREIGN KEY ("sourceCompanyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EconomicRelationship"
    ADD CONSTRAINT "EconomicRelationship_targetCompanyId_organizationId_fkey"
    FOREIGN KEY ("targetCompanyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EconomicRelationship"
    ADD CONSTRAINT "EconomicRelationship_snapshotId_organizationId_sourceCompanyId_fkey"
    FOREIGN KEY ("snapshotId", "organizationId", "sourceCompanyId") REFERENCES "AccountIntelligenceSnapshot"("id", "organizationId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS fail-closed. Diferente de migrations antigas que usavam WITH CHECK (true), novas escritas
-- tambem precisam carregar o tenant da request ou bypass explicito. Isso impede que um INSERT com
-- organizationId forjado crie dados no tenant vizinho.
DO $rls$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'AccountIntelligenceSnapshot',
        'AccountSignal',
        'DecisionMaker',
        'IntelligenceEvidence',
        'AccountScore',
        'AccountRecommendation',
        'EconomicRelationship'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format(
            'CREATE POLICY tenant_isolation_policy ON %I FOR ALL USING (' ||
            'current_setting(''app.current_tenant_id'', TRUE) = "organizationId" ' ||
            'OR current_setting(''app.bypass_rls'', TRUE) = ''on'') WITH CHECK (' ||
            'current_setting(''app.current_tenant_id'', TRUE) = "organizationId" ' ||
            'OR current_setting(''app.bypass_rls'', TRUE) = ''on'')',
            table_name
        );
    END LOOP;
END
$rls$;
