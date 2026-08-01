-- Corrige a dimensão de DocumentChunk.vector.
--
-- O schema.prisma sempre declarou `Unsupported("vector(768)")`, mas a coluna existia no banco como
-- vector(1536) — deriva antiga, provavelmente de quando o projeto mirava embeddings da OpenAI
-- (ada-002 = 1536). O Prisma não reconcilia tipos `Unsupported`, então a divergência passou
-- despercebida até uma escrita real de vetor falhar com "expected 1536 dimensions, not 768".
--
-- O modelo em uso hoje (multilingual-e5-base, local) produz 768 dimensões, igual ao declarado.
--
-- A conversão é condicional e só acontece quando não há vetor gravado: mudar a dimensão de uma
-- coluna com dados exigiria regerar todos os embeddings, o que não cabe numa migration.

DO $$
DECLARE
    dimensao_atual TEXT;
    vetores_gravados INTEGER;
BEGIN
    SELECT format_type(a.atttypid, a.atttypmod) INTO dimensao_atual
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE c.relname = 'DocumentChunk' AND a.attname = 'vector' AND NOT a.attisdropped;

    IF dimensao_atual IS NULL THEN
        RAISE NOTICE 'Coluna DocumentChunk.vector nao existe (banco sem pgvector); nada a fazer.';
        RETURN;
    END IF;

    IF dimensao_atual = 'vector(768)' THEN
        RAISE NOTICE 'DocumentChunk.vector ja esta em 768 dimensoes.';
        RETURN;
    END IF;

    SELECT count(*) INTO vetores_gravados FROM "DocumentChunk" WHERE "vector" IS NOT NULL;

    IF vetores_gravados > 0 THEN
        RAISE EXCEPTION
            'DocumentChunk.vector esta em % com % vetor(es) gravado(s). Converter exigiria regerar os embeddings; rode a revetorizacao antes.',
            dimensao_atual, vetores_gravados;
    END IF;

    -- O índice depende do tipo da coluna: precisa cair antes da conversão.
    DROP INDEX IF EXISTS "DocumentChunk_vector_idx";

    ALTER TABLE "DocumentChunk"
        ALTER COLUMN "vector" TYPE vector(768) USING NULL;

    CREATE INDEX "DocumentChunk_vector_idx" ON "DocumentChunk"
        USING ivfflat ("vector" vector_cosine_ops) WITH (lists = 100);

    RAISE NOTICE 'DocumentChunk.vector convertido de % para vector(768).', dimensao_atual;
END $$;
