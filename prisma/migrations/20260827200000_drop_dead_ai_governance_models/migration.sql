-- DEC-08 (dossiê de decisões, auditoria CPI): AIGovernancePolicy/AIEvaluation nunca foram lidos
-- nem escritos por nenhum código deste repositório (confirmado por busca completa em src/ e
-- tests/ antes desta migration). Os pontos de decisão que pareciam destinados a resolver
-- (orçamento de IA, config por ferramenta, guardrails de PII) já têm solução própria e deliberada,
-- separada (ver src/lib/ai/budget.ts, guardrails.service.ts). Usuário decidiu remover em vez de
-- construir um motor de política novo em cima de schema morto.
--
-- DROP TABLE remove a policy de RLS e os índices junto (Postgres cuida disso automaticamente) —
-- nenhuma FK de outro model aponta para estas duas tabelas.
DROP TABLE IF EXISTS "AIEvaluation";
DROP TABLE IF EXISTS "AIGovernancePolicy";
