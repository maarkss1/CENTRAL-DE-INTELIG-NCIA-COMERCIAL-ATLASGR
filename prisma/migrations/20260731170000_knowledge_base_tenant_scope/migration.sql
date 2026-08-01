-- Base de Conhecimento: escopo por tenant + metadados de origem.
--
-- `Document` nasceu sem `organizationId`, então antes de tornar a coluna NOT NULL precisamos
-- adotar as linhas órfãs. Como a tabela não era exposta por nenhuma rota até agora (o serviço de
-- ingestão nunca foi ligado ao servidor), na prática ela está vazia em qualquer ambiente real;
-- ainda assim o backfill abaixo é feito de forma segura para não quebrar bases de teste.

-- 1. Colunas novas (nullable primeiro, para permitir o backfill)
ALTER TABLE "Document" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Document" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "Document" ADD COLUMN "sourceName" TEXT;
ALTER TABLE "Document" ADD COLUMN "chunkCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Document" ADD COLUMN "createdBy" TEXT;

ALTER TABLE "DocumentChunk" ADD COLUMN "chunkIndex" INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill: adota documentos pré-existentes na organização mais antiga.
UPDATE "Document"
SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "organizationId" IS NULL;

-- Se sobrou documento sem organização (base sem nenhuma Organization), remove: sem tenant não há
-- como aplicar RLS e a linha seria invisível de qualquer forma.
DELETE FROM "Document" WHERE "organizationId" IS NULL;

-- 3. Materializa o chunkCount dos documentos que já tinham trechos.
UPDATE "Document" d
SET "chunkCount" = (SELECT COUNT(*) FROM "DocumentChunk" c WHERE c."documentId" = d."id");

-- 4. Agora a coluna pode ser obrigatória.
ALTER TABLE "Document" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Document"
    ADD CONSTRAINT "Document_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Document_organizationId_createdAt_idx" ON "Document"("organizationId", "createdAt");

-- 5. Índice vetorial para a busca semântica.
-- IVFFlat com cosine: o `vector_cosine_ops` casa com o operador `<=>` usado no SearchService.
-- `lists = 100` é o padrão recomendado do pgvector para tabelas até ~1M linhas.
--
-- Condicional de propósito: nem todo Postgres em que esta migration roda tem a extensão pgvector
-- (o docker-compose usa a imagem pgvector, mas ambientes locais frequentemente têm um Postgres
-- comum). Sem a extensão, a coluna "vector" é TEXT e o índice não faz sentido — a aplicação detecta
-- isso em runtime (ver vector-support.ts) e opera só com busca por palavra-chave.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
       AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'DocumentChunk' AND column_name = 'vector' AND udt_name = 'vector'
       )
    THEN
        CREATE INDEX "DocumentChunk_vector_idx" ON "DocumentChunk"
            USING ivfflat ("vector" vector_cosine_ops) WITH (lists = 100);
    ELSE
        RAISE NOTICE 'pgvector ausente: indice vetorial nao criado; a busca semantica fica desativada.';
    END IF;
END $$;

-- 6. RLS, no mesmo padrão das demais tabelas com tenant (ver 20260722020322_enable_rls).
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "Document" FOR ALL
USING (
    current_setting('app.current_tenant_id', TRUE) = "organizationId"
    OR current_setting('app.bypass_rls', TRUE) = 'on'
);

-- DocumentChunk não tem organizationId próprio: herda o isolamento do documento pai.
ALTER TABLE "DocumentChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentChunk" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "DocumentChunk" FOR ALL
USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR EXISTS (
        SELECT 1 FROM "Document" d
        WHERE d."id" = "DocumentChunk"."documentId"
          AND current_setting('app.current_tenant_id', TRUE) = d."organizationId"
    )
);
