-- AlterTable
ALTER TABLE "CopilotoCrmFieldSuggestion" ADD COLUMN     "writebackError" TEXT;

-- CreateTable
CREATE TABLE "CopilotoBitrixFieldMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "CopilotoCrmEntityType" NOT NULL,
    "semanticField" TEXT NOT NULL,
    "bitrixFieldCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopilotoBitrixFieldMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopilotoBitrixFieldMapping_organizationId_idx" ON "CopilotoBitrixFieldMapping"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CopilotoBitrixFieldMapping_organizationId_entityType_semant_key" ON "CopilotoBitrixFieldMapping"("organizationId", "entityType", "semanticField");

-- AddForeignKey
ALTER TABLE "CopilotoBitrixFieldMapping" ADD CONSTRAINT "CopilotoBitrixFieldMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
