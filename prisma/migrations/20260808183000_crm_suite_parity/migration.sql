-- CRM 360: pipelines configuráveis, catálogo, itens de negócio e documentos comerciais.
-- A migração é aditiva: preserva o Kanban e todos os registros legados.
--
-- Produção já recebeu parte deste schema por outro caminho antes de o histórico do
-- Prisma ser reconciliado. Por isso esta migration é deliberadamente idempotente:
-- objetos existentes são preservados e objetos ausentes continuam sendo criados.

-- Enums: PostgreSQL não oferece CREATE TYPE ... IF NOT EXISTS para enums, então
-- protegemos a criação e garantimos cada valor separadamente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'CrmPipelineEntity' AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE "CrmPipelineEntity" AS ENUM ('Lead', 'Negocio', 'SmartProcess');
  END IF;
END $$;
ALTER TYPE "CrmPipelineEntity" ADD VALUE IF NOT EXISTS 'Lead';
ALTER TYPE "CrmPipelineEntity" ADD VALUE IF NOT EXISTS 'Negocio';
ALTER TYPE "CrmPipelineEntity" ADD VALUE IF NOT EXISTS 'SmartProcess';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'CrmProductType' AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE "CrmProductType" AS ENUM ('Produto', 'Servico');
  END IF;
END $$;
ALTER TYPE "CrmProductType" ADD VALUE IF NOT EXISTS 'Produto';
ALTER TYPE "CrmProductType" ADD VALUE IF NOT EXISTS 'Servico';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'CrmDocumentType' AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE "CrmDocumentType" AS ENUM ('Orcamento', 'Proposta', 'Fatura', 'Contrato');
  END IF;
END $$;
ALTER TYPE "CrmDocumentType" ADD VALUE IF NOT EXISTS 'Orcamento';
ALTER TYPE "CrmDocumentType" ADD VALUE IF NOT EXISTS 'Proposta';
ALTER TYPE "CrmDocumentType" ADD VALUE IF NOT EXISTS 'Fatura';
ALTER TYPE "CrmDocumentType" ADD VALUE IF NOT EXISTS 'Contrato';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'CrmDocumentStatus' AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE "CrmDocumentStatus" AS ENUM ('Rascunho', 'Enviado', 'Visualizado', 'Aceito', 'Recusado', 'Vencido', 'Pago', 'Cancelado');
  END IF;
END $$;
ALTER TYPE "CrmDocumentStatus" ADD VALUE IF NOT EXISTS 'Rascunho';
ALTER TYPE "CrmDocumentStatus" ADD VALUE IF NOT EXISTS 'Enviado';
ALTER TYPE "CrmDocumentStatus" ADD VALUE IF NOT EXISTS 'Visualizado';
ALTER TYPE "CrmDocumentStatus" ADD VALUE IF NOT EXISTS 'Aceito';
ALTER TYPE "CrmDocumentStatus" ADD VALUE IF NOT EXISTS 'Recusado';
ALTER TYPE "CrmDocumentStatus" ADD VALUE IF NOT EXISTS 'Vencido';
ALTER TYPE "CrmDocumentStatus" ADD VALUE IF NOT EXISTS 'Pago';
ALTER TYPE "CrmDocumentStatus" ADD VALUE IF NOT EXISTS 'Cancelado';

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "customFields" JSONB;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "customFields" JSONB;
ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "amount" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS "probability" INTEGER,
  ADD COLUMN IF NOT EXISTS "expectedCloseAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "customFields" JSONB,
  ADD COLUMN IF NOT EXISTS "pipelineId" TEXT,
  ADD COLUMN IF NOT EXISTS "pipelineStageId" TEXT;

CREATE TABLE IF NOT EXISTS "CrmPipeline" (
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

CREATE TABLE IF NOT EXISTS "CrmPipelineStage" (
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

CREATE TABLE IF NOT EXISTS "CrmProduct" (
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

CREATE TABLE IF NOT EXISTS "CrmDealItem" (
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

CREATE TABLE IF NOT EXISTS "CrmCommercialDocument" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "CrmPipeline_organizationId_name_key" ON "CrmPipeline"("organizationId", "name");
CREATE INDEX IF NOT EXISTS "CrmPipeline_organizationId_entity_active_idx" ON "CrmPipeline"("organizationId", "entity", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "CrmPipelineStage_pipelineId_code_key" ON "CrmPipelineStage"("pipelineId", "code");
CREATE INDEX IF NOT EXISTS "CrmPipelineStage_pipelineId_sortOrder_idx" ON "CrmPipelineStage"("pipelineId", "sortOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "CrmProduct_organizationId_sku_key" ON "CrmProduct"("organizationId", "sku");
CREATE INDEX IF NOT EXISTS "CrmProduct_organizationId_active_name_idx" ON "CrmProduct"("organizationId", "active", "name");
CREATE INDEX IF NOT EXISTS "CrmDealItem_organizationId_leadId_sortOrder_idx" ON "CrmDealItem"("organizationId", "leadId", "sortOrder");
CREATE INDEX IF NOT EXISTS "CrmDealItem_productId_idx" ON "CrmDealItem"("productId");
CREATE UNIQUE INDEX IF NOT EXISTS "CrmCommercialDocument_publicToken_key" ON "CrmCommercialDocument"("publicToken");
CREATE UNIQUE INDEX IF NOT EXISTS "CrmCommercialDocument_organizationId_number_key" ON "CrmCommercialDocument"("organizationId", "number");
CREATE INDEX IF NOT EXISTS "CrmCommercialDocument_organizationId_type_status_idx" ON "CrmCommercialDocument"("organizationId", "type", "status");
CREATE INDEX IF NOT EXISTS "CrmCommercialDocument_leadId_idx" ON "CrmCommercialDocument"("leadId");
CREATE INDEX IF NOT EXISTS "Lead_organizationId_pipelineId_pipelineStageId_idx" ON "Lead"("organizationId", "pipelineId", "pipelineStageId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmPipeline_organizationId_fkey' AND conrelid = '"CrmPipeline"'::regclass) THEN
    ALTER TABLE "CrmPipeline" ADD CONSTRAINT "CrmPipeline_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmPipelineStage_pipelineId_fkey' AND conrelid = '"CrmPipelineStage"'::regclass) THEN
    ALTER TABLE "CrmPipelineStage" ADD CONSTRAINT "CrmPipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lead_pipelineId_fkey' AND conrelid = '"Lead"'::regclass) THEN
    ALTER TABLE "Lead" ADD CONSTRAINT "Lead_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lead_pipelineStageId_fkey' AND conrelid = '"Lead"'::regclass) THEN
    ALTER TABLE "Lead" ADD CONSTRAINT "Lead_pipelineStageId_fkey" FOREIGN KEY ("pipelineStageId") REFERENCES "CrmPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmProduct_organizationId_fkey' AND conrelid = '"CrmProduct"'::regclass) THEN
    ALTER TABLE "CrmProduct" ADD CONSTRAINT "CrmProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmDealItem_leadId_fkey' AND conrelid = '"CrmDealItem"'::regclass) THEN
    ALTER TABLE "CrmDealItem" ADD CONSTRAINT "CrmDealItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmDealItem_productId_fkey' AND conrelid = '"CrmDealItem"'::regclass) THEN
    ALTER TABLE "CrmDealItem" ADD CONSTRAINT "CrmDealItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CrmProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmDealItem_organizationId_fkey' AND conrelid = '"CrmDealItem"'::regclass) THEN
    ALTER TABLE "CrmDealItem" ADD CONSTRAINT "CrmDealItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmCommercialDocument_leadId_fkey' AND conrelid = '"CrmCommercialDocument"'::regclass) THEN
    ALTER TABLE "CrmCommercialDocument" ADD CONSTRAINT "CrmCommercialDocument_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmCommercialDocument_companyId_fkey' AND conrelid = '"CrmCommercialDocument"'::regclass) THEN
    ALTER TABLE "CrmCommercialDocument" ADD CONSTRAINT "CrmCommercialDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmCommercialDocument_contactId_fkey' AND conrelid = '"CrmCommercialDocument"'::regclass) THEN
    ALTER TABLE "CrmCommercialDocument" ADD CONSTRAINT "CrmCommercialDocument_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmCommercialDocument_organizationId_fkey' AND conrelid = '"CrmCommercialDocument"'::regclass) THEN
    ALTER TABLE "CrmCommercialDocument" ADD CONSTRAINT "CrmCommercialDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

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

DROP POLICY IF EXISTS tenant_isolation_policy ON "CrmPipeline";
CREATE POLICY tenant_isolation_policy ON "CrmPipeline" FOR ALL
USING (current_setting('app.current_tenant_id', TRUE) = "organizationId" OR current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation_policy ON "CrmPipelineStage";
CREATE POLICY tenant_isolation_policy ON "CrmPipelineStage" FOR ALL
USING ("pipelineId" IN (SELECT id FROM "CrmPipeline" WHERE "organizationId" = current_setting('app.current_tenant_id', TRUE)) OR current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation_policy ON "CrmProduct";
CREATE POLICY tenant_isolation_policy ON "CrmProduct" FOR ALL
USING (current_setting('app.current_tenant_id', TRUE) = "organizationId" OR current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation_policy ON "CrmDealItem";
CREATE POLICY tenant_isolation_policy ON "CrmDealItem" FOR ALL
USING (current_setting('app.current_tenant_id', TRUE) = "organizationId" OR current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation_policy ON "CrmCommercialDocument";
CREATE POLICY tenant_isolation_policy ON "CrmCommercialDocument" FOR ALL
USING (current_setting('app.current_tenant_id', TRUE) = "organizationId" OR current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK (true);
