-- PC-011: KnowledgeDocument era armazenamento legado de RAG, substituído por Document/
-- DocumentChunk. Confirmado nesta auditoria (Platform Completion, 2026-08-10): zero chamadas
-- Prisma (`prisma.knowledgeDocument.*`) em todo o código; sem organizationId (nunca poderia ser
-- usado com segurança multi-tenant mesmo se reconectado); sem relação com nenhum outro model. Uma
-- sessão anterior (20260807100000_enable_rls_remaining_tables) já havia identificado exatamente
-- isso e bloqueado a tabela com uma bypass_only_policy em vez de remover — esta migração conclui
-- essa decisão pendente, com autorização explícita do usuário (a tabela nunca teve dado
-- atribuível a uma organização real, então não há perda de dado de produção possível).
-- DROP TABLE remove a política RLS e o índice/PK junto, não precisa de passos separados.

DROP TABLE "KnowledgeDocument";
