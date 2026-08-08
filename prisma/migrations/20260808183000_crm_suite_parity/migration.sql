-- CRM 360: pipelines configuráveis, catálogo, itens de negócio e documentos comerciais.
-- A migração é aditiva: preserva o Kanban e todos os registros legados.

CREATE TYPE "CrmPipelineEntity" AS ENUM ('Lead', 'Negocio', 'SmartProcess');
CREATE TYPE "CrmProductType" AS ENUM ('Produto', 'Servico');
CREATE TYPE "CrmDocumentType" AS ENUM ('Orcamento', 'Proposta', 'Fatura', 'Contrato');
CREATE TYPE "CrmDocumentStatus" AS ENUM ('Rascunho', 'Enviado', 'Visualizado', 'Aceito', 'Recusado', 'Vencido', 'Pago', 'Cancelado');

ALTER TABLE "Company" ADD COLUMN "customFields" JSONB;
ALTER TABLE "Contact" ADD COLUMN "customFields" JSONB;
ALTER TABLE "Lead"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "amount" DOUBLE PRECISION,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'BRL',
  ADD COLUMN "probability" INTEGER,
  ADD COLUMN "expectedCloseAt" TIMESTAMP(3),
  ADD COLUMN "customFields" JSONB,
  ADD COLUMN "pipelineId" TEXT,
  ADD COLUMN "pipelineStageId" TEXT;

CREATE TABLE "CrmPipeline" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "entity" "CrmPipelineEntity" NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmPipeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmPipelineStage" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#64748b',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "probability" INTEGER NOT NULL DEFAULT 0,
  "leadStatus" "LeadStatus",
  "isWon" BOOLEAN NOT NULL DEFAULT false,
  "isLost" BOOLEAN NOT NULL DEFAULT false,
  "tunnelTargetStageId" TEXT,
  "automation" JSONB,
  "pipelineId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmPipelineStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmProduct" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sku" TEXT,
  "type" "CrmProductType" NOT NULL DEFAULT 'Servico',
  "category" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'un',
  "price" DOUBLE PRECISION NOT NULL,
  "cost" DOUBLE PRECISION,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "taxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "stockQuantity" DOUBLE PRECISION,
  "customFields" JSONB,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmDealItem" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total" DOUBLE PRECISION NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "leadId" TEXT NOT NULL,
  "productId" TEXT,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmDealItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmCommercialDocument" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "type" "CrmDocumentType" NOT NULL,
  "status" "CrmDocumentStatus" NOT NULL DEFAULT 'Rascunho',
  "title" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lineItems" JSONB NOT NULL,
  "notes" TEXT,
  "terms" TEXT,
  "publicToken" TEXT NOT NULL,
  "leadId" TEXT,
  "companyId" TEXT,
  "contactId" TEXT,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmCommercialDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmPipeline_organizationId_name_key" ON "CrmPipeline"("organizationId", "name");
CREATE INDEX "CrmPipeline_organizationId_entity_active_idx" ON "CrmPipeline"("organizationId", "entity", "active");
CREATE UNIQUE INDEX "CrmPipelineStage_pipelineId_code_key" ON "CrmPipelineStage"("pipelineId", "code");
CREATE INDEX "CrmPipelineStage_pipelineId_sortOrder_idx" ON "CrmPipelineStage"("pipelineId", "sortOrder");
CREATE UNIQUE INDEX "CrmProduct_organizationId_sku_key" ON "CrmProduct"("organizationId", "sku");
CREATE INDEX "CrmProduct_organizationId_active_name_idx" ON "CrmProduct"("organizationId", "active", "name");
CREATE INDEX "CrmDealItem_organizationId_leadId_sortOrder_idx" ON "CrmDealItem"("organizationId", "leadId", "sortOrder");
CREATE INDEX "CrmDealItem_productId_idx" ON "CrmDealItem"("productId");
CREATE UNIQUE INDEX "CrmCommercialDocument_publicToken_key" ON "CrmCommercialDocument"("publicToken");
CREATE UNIQUE INDEX "CrmCommercialDocument_organizationId_number_key" ON "CrmCommercialDocument"("organizationId", "number");
CREATE INDEX "CrmCommercialDocument_organizationId_type_status_idx" ON "CrmCommercialDocument"("organizationId", "type", "status");
CREATE INDEX "CrmCommercialDocument_leadId_idx" ON "CrmCommercialDocument"("leadId");
CREATE INDEX "Lead_organizationId_pipelineId_pipelineStageId_idx" ON "Lead"("organizationId", "pipelineId", "pipelineStageId");

ALTER TABLE "CrmPipeline" ADD CONSTRAINT "CrmPipeline_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmPipelineStage" ADD CONSTRAINT "CrmPipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_pipelineStageId_fkey" FOREIGN KEY ("pipelineStageId") REFERENCES "CrmPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmProduct" ADD CONSTRAINT "CrmProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmDealItem" ADD CONSTRAINT "CrmDealItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmDealItem" ADD CONSTRAINT "CrmDealItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CrmProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDealItem" ADD CONSTRAINT "CrmDealItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCommercialDocument" ADD CONSTRAINT "CrmCommercialDocument_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmCommercialDocument" ADD CONSTRAINT "CrmCommercialDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmCommercialDocument" ADD CONSTRAINT "CrmCommercialDocument_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmCommercialDocument" ADD CONSTRAINT "CrmCommercialDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmPipeline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CrmPipeline" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CrmPipelineStage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CrmPipelineStage" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CrmProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CrmProduct" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CrmDealItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CrmDealItem" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CrmCommercialDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CrmCommercialDocument" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "CrmPipeline" FOR ALL
USING (current_setting('app.current_tenant_id', TRUE) = "organizationId" OR current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK (true);
CREATE POLICY tenant_isolation_policy ON "CrmPipelineStage" FOR ALL
USING ("pipelineId" IN (SELECT id FROM "CrmPipeline" WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)) OR current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK (true);
CREATE POLICY tenant_isolation_policy ON "CrmProduct" FOR ALL
USING (current_setting('app.current_tenant_id', TRUE) = "organizationId" OR current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK (true);
CREATE POLICY tenant_isolation_policy ON "CrmDealItem" FOR ALL
USING (current_setting('app.current_tenant_id', TRUE) = "organizationId" OR current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK (true);
CREATE POLICY tenant_isolation_policy ON "CrmCommercialDocument" FOR ALL
USING (current_setting('app.current_tenant_id', TRUE) = "organizationId" OR current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK (true);
