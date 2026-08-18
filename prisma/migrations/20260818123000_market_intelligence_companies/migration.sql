-- Etapa 2 do Market Intelligence: universo empresarial versionado, separado do CRM Company.
-- A publicação usa MarketIntelligenceDataset.publicationSlot para trocar snapshots de forma
-- atômica; nenhuma linha PROCESSING/FAILED fica visível para as APIs de produção.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "MarketIntelligenceDatasetStatus" AS ENUM (
    'PENDING', 'PROCESSING', 'VALIDATING', 'READY', 'FAILED', 'ARCHIVED'
);

CREATE TYPE "MarketIntelligenceIcpTier" AS ENUM (
    'MUITO_ALTO', 'ALTO', 'MEDIO', 'BAIXO', 'FORA_DO_ICP'
);

CREATE TYPE "MarketIntelligenceDataOrigin" AS ENUM (
    'OBSERVED', 'DERIVED', 'ESTIMATED', 'SIMULATED', 'NOT_AVAILABLE'
);

CREATE TABLE "MarketIntelligenceDataset" (
    "id" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceVersion" TEXT,
    "sourceUrl" TEXT,
    "status" "MarketIntelligenceDatasetStatus" NOT NULL DEFAULT 'PENDING',
    "publicationSlot" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "recordsRead" BIGINT NOT NULL DEFAULT 0,
    "recordsImported" BIGINT NOT NULL DEFAULT 0,
    "recordsRejected" BIGINT NOT NULL DEFAULT 0,
    "recordsActive" BIGINT NOT NULL DEFAULT 0,
    "hash" TEXT NOT NULL,
    "pipelineVersion" TEXT NOT NULL,
    "outputManifest" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketIntelligenceDataset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketIntelligenceCompany" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "cnpjBasico" TEXT NOT NULL,
    "cnpjOrdem" TEXT NOT NULL,
    "cnpjDv" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "razaoSocialSearch" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "nomeFantasiaSearch" TEXT,
    "matrizFilial" TEXT,
    "situacaoCadastralCodigo" TEXT,
    "situacaoCadastral" TEXT,
    "dataSituacaoCadastral" DATE,
    "motivoSituacaoCodigo" TEXT,
    "motivoSituacaoCadastral" TEXT,
    "dataInicioAtividade" DATE,
    "cnaePrincipal" TEXT,
    "cnaePrincipalDescricao" TEXT,
    "cnaesSecundarios" JSONB,
    "naturezaJuridicaCodigo" TEXT,
    "naturezaJuridica" TEXT,
    "porteCodigo" TEXT,
    "porte" TEXT,
    "capitalSocial" DECIMAL(20,2),
    "qualificacaoResponsavelCodigo" TEXT,
    "qualificacaoResponsavel" TEXT,
    "enteFederativoResponsavel" TEXT,
    "opcaoSimples" TEXT,
    "dataOpcaoSimples" DATE,
    "dataExclusaoSimples" DATE,
    "opcaoMei" TEXT,
    "dataOpcaoMei" DATE,
    "dataExclusaoMei" DATE,
    "tipoLogradouro" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cep" TEXT,
    "municipioCodigoReceita" TEXT,
    "municipioIbge" TEXT,
    "municipioNome" TEXT,
    "uf" TEXT,
    "ddd1" TEXT,
    "telefone1" TEXT,
    "ddd2" TEXT,
    "telefone2" TEXT,
    "dddFax" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "icpTier" "MarketIntelligenceIcpTier",
    "icpScore" INTEGER,
    "icpReasons" JSONB,
    "icpTaxonomyVersion" TEXT,
    "icpCalculatedAt" TIMESTAMP(3),
    "hasRntrc" BOOLEAN,
    "rntrcStatus" TEXT,
    "rntrcType" TEXT,
    "rntrcNumber" TEXT,
    "rntrcSource" TEXT,
    "rntrcUpdatedAt" TIMESTAMP(3),
    "dataOrigin" "MarketIntelligenceDataOrigin" NOT NULL DEFAULT 'OBSERVED',
    "competencia" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketIntelligenceCompany_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MarketIntelligenceCompany_icpScore_check"
        CHECK ("icpScore" IS NULL OR "icpScore" BETWEEN 0 AND 100),
    CONSTRAINT "MarketIntelligenceCompany_cnpj_check"
        CHECK ("cnpj" ~ '^[A-Z0-9]{12}[0-9]{2}$')
);

CREATE TABLE "MarketIntelligenceMunicipalityMapping" (
    "id" TEXT NOT NULL,
    "receitaCode" TEXT NOT NULL,
    "receitaName" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "ibgeCode" TEXT NOT NULL,
    "ibgeName" TEXT NOT NULL,
    "mappingMethod" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketIntelligenceMunicipalityMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketIntelligenceDataset_publicationSlot_key"
    ON "MarketIntelligenceDataset"("publicationSlot");
CREATE UNIQUE INDEX "MarketIntelligenceDataset_dataset_competencia_hash_key"
    ON "MarketIntelligenceDataset"("dataset", "competencia", "hash");
CREATE INDEX "MarketIntelligenceDataset_dataset_status_competencia_idx"
    ON "MarketIntelligenceDataset"("dataset", "status", "competencia");
CREATE INDEX "MarketIntelligenceDataset_competencia_idx"
    ON "MarketIntelligenceDataset"("competencia");

CREATE UNIQUE INDEX "MarketIntelligenceCompany_datasetId_cnpj_key"
    ON "MarketIntelligenceCompany"("datasetId", "cnpj");
CREATE INDEX "MarketIntelligenceCompany_datasetId_cnpjBasico_idx"
    ON "MarketIntelligenceCompany"("datasetId", "cnpjBasico");
CREATE INDEX "MarketIntelligenceCompany_datasetId_cnaePrincipal_uf_idx"
    ON "MarketIntelligenceCompany"("datasetId", "cnaePrincipal", "uf");
CREATE INDEX "MarketIntelligenceCompany_datasetId_uf_municipioIbge_idx"
    ON "MarketIntelligenceCompany"("datasetId", "uf", "municipioIbge");
CREATE INDEX "MarketIntelligenceCompany_datasetId_uf_situacaoCadastral_idx"
    ON "MarketIntelligenceCompany"("datasetId", "uf", "situacaoCadastral");
CREATE INDEX "MarketIntelligenceCompany_datasetId_municipioIbge_situacao_idx"
    ON "MarketIntelligenceCompany"("datasetId", "municipioIbge", "situacaoCadastral");
CREATE INDEX "MarketIntelligenceCompany_datasetId_municipioIbge_icpTier_idx"
    ON "MarketIntelligenceCompany"("datasetId", "municipioIbge", "icpTier");
CREATE INDEX "MarketIntelligenceCompany_datasetId_matrizFilial_idx"
    ON "MarketIntelligenceCompany"("datasetId", "matrizFilial");
CREATE INDEX "MarketIntelligenceCompany_datasetId_hasRntrc_idx"
    ON "MarketIntelligenceCompany"("datasetId", "hasRntrc");
CREATE INDEX "MarketIntelligenceCompany_datasetId_icpScore_idx"
    ON "MarketIntelligenceCompany"("datasetId", "icpScore");
CREATE INDEX "MarketIntelligenceCompany_datasetId_capitalSocial_idx"
    ON "MarketIntelligenceCompany"("datasetId", "capitalSocial");
CREATE INDEX "MarketIntelligenceCompany_competencia_idx"
    ON "MarketIntelligenceCompany"("competencia");
CREATE INDEX "MarketIntelligenceCompany_razaoSocialSearch_trgm_idx"
    ON "MarketIntelligenceCompany" USING GIN ("razaoSocialSearch" gin_trgm_ops);
CREATE INDEX "MarketIntelligenceCompany_nomeFantasiaSearch_trgm_idx"
    ON "MarketIntelligenceCompany" USING GIN ("nomeFantasiaSearch" gin_trgm_ops);
CREATE INDEX "MarketIntelligenceCompany_cnaesSecundarios_gin_idx"
    ON "MarketIntelligenceCompany" USING GIN ("cnaesSecundarios" jsonb_path_ops);

CREATE UNIQUE INDEX "MarketIntelligenceMunicipalityMapping_receitaCode_key"
    ON "MarketIntelligenceMunicipalityMapping"("receitaCode");
CREATE INDEX "MarketIntelligenceMunicipalityMapping_ibgeCode_idx"
    ON "MarketIntelligenceMunicipalityMapping"("ibgeCode");
CREATE INDEX "MarketIntelligenceMunicipalityMapping_uf_ibgeName_idx"
    ON "MarketIntelligenceMunicipalityMapping"("uf", "ibgeName");

ALTER TABLE "MarketIntelligenceCompany"
    ADD CONSTRAINT "MarketIntelligenceCompany_datasetId_fkey"
    FOREIGN KEY ("datasetId") REFERENCES "MarketIntelligenceDataset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Dataset global somente-leitura para requests autenticadas. Escrita/publicação requer bypass
-- explícito, usado apenas pelo importador operacional com credencial de banco.
ALTER TABLE "MarketIntelligenceDataset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketIntelligenceDataset" FORCE ROW LEVEL SECURITY;
ALTER TABLE "MarketIntelligenceCompany" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketIntelligenceCompany" FORCE ROW LEVEL SECURITY;
ALTER TABLE "MarketIntelligenceMunicipalityMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketIntelligenceMunicipalityMapping" FORCE ROW LEVEL SECURITY;

CREATE POLICY market_intelligence_read ON "MarketIntelligenceDataset" FOR SELECT USING (
    current_setting('app.current_tenant_id', TRUE) <> ''
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
CREATE POLICY market_intelligence_write ON "MarketIntelligenceDataset" FOR ALL USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
) WITH CHECK (current_setting('app.bypass_rls', TRUE) = 'on');

CREATE POLICY market_intelligence_read ON "MarketIntelligenceCompany" FOR SELECT USING (
    current_setting('app.current_tenant_id', TRUE) <> ''
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
CREATE POLICY market_intelligence_write ON "MarketIntelligenceCompany" FOR ALL USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
) WITH CHECK (current_setting('app.bypass_rls', TRUE) = 'on');

CREATE POLICY market_intelligence_read ON "MarketIntelligenceMunicipalityMapping" FOR SELECT USING (
    current_setting('app.current_tenant_id', TRUE) <> ''
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);
CREATE POLICY market_intelligence_write ON "MarketIntelligenceMunicipalityMapping" FOR ALL USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
) WITH CHECK (current_setting('app.bypass_rls', TRUE) = 'on');
