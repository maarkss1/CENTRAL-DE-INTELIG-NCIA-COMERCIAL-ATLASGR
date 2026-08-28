-- Onda 40 (auditoria CPI — "RAG: document version/freshness ausente"): Document ganha um contador
-- de versão simples, incrementado só quando o conteúdo é reindexado (ver ingestion.service.ts
-- updateDocument). Todas as linhas existentes começam em 1 (nunca foram "reindexadas" por esta
-- coluna, então 1 é o estado inicial correto, não um valor fabricado).
ALTER TABLE "Document" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
