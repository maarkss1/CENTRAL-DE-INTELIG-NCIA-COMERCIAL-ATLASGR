CREATE TABLE "BitrixSyncRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "stageId" TEXT,
    "assignedById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastImportedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BitrixSyncRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BitrixSyncRule_organizationId_idx" ON "BitrixSyncRule"("organizationId");
CREATE INDEX "BitrixSyncRule_active_idx" ON "BitrixSyncRule"("active");

ALTER TABLE "BitrixSyncRule"
    ADD CONSTRAINT "BitrixSyncRule_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BitrixSyncRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BitrixSyncRule" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "BitrixSyncRule" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
