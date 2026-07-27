-- CreateTable
CREATE TABLE "AiEngineSetting" (
    "id" TEXT NOT NULL,
    "toolKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEngineSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT,
    "companyName" TEXT NOT NULL,
    "fantasyName" TEXT,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "enrichedData" JSONB,
    "intelligence" JSONB,
    "leadScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "bitrixId" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiEngineSetting_toolKey_key" ON "AiEngineSetting"("toolKey");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_cnpj_key" ON "Prospect"("cnpj");

-- CreateIndex
CREATE INDEX "Prospect_organizationId_idx" ON "Prospect"("organizationId");

-- CreateIndex
CREATE INDEX "Prospect_status_idx" ON "Prospect"("status");

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
