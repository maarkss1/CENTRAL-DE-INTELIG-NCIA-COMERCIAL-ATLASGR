ALTER TABLE "AIPendingAction"
ADD COLUMN "organizationId" TEXT;

CREATE INDEX "AIPendingAction_organizationId_approved_idx"
ON "AIPendingAction"("organizationId", "approved");

ALTER TABLE "AIPendingAction"
ADD CONSTRAINT "AIPendingAction_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
