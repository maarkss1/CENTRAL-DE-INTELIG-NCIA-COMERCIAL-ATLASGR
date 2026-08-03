-- Look-alike scoring via pgvector: embedding do perfil firmográfico da empresa (mesma dimensão do
-- KnowledgeChunk, 768 — extensão "vector" já habilitada desde add_lead_enrichment) e o resultado
-- calculado a partir dele, para medir semelhança com empresas que já fecharam negócio. Ver
-- lookalike-scoring.service.ts.

ALTER TABLE "Company" ADD COLUMN "profileEmbedding" vector(768);
ALTER TABLE "Company" ADD COLUMN "lookalikeScore" DOUBLE PRECISION;
ALTER TABLE "Company" ADD COLUMN "lookalikeTopMatches" JSONB;

-- ivfflat exige linhas na tabela para escolher os clusters com alguma qualidade; poucas empresas
-- cadastradas hoje tornariam o índice pior que uma varredura sequencial. Criamos sem índice
-- especializado agora — o volume de Company por tenant é pequeno o bastante (não é um índice de
-- milhões de linhas como KnowledgeChunk) para um full scan com <=> ser aceitável por enquanto.
