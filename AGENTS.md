# Diretrizes do Agente - CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR

## 1. Contexto do Projeto
- Central de Inteligência Comercial e Prospecção B2B com Kanban de Vendas, Lead Scoring e automações.

## 2. Regras de Código & Desenvolvimento
- Escreva código completo de nível de produção. NUNCA use comentários como `// TODO: implementar` ou omita trechos de código.
- Stack: Vite, React/TypeScript, Node.js (Server.ts), Prisma ORM, PostgreSQL.
- Mantenha sincronização rigorosa entre as colunas do Kanban e o estado do banco de dados.
- Respeite o fluxo de remedição e diagnósticos documentados em `REMEDIACAO_FINAL_PROSPECTOR_ATLASGR.md`.

## 3. Performance & Integração
- Mantenha a latência das consultas ao Apollo/Prisma abaixo de 200ms.
- Teste todas as requisições de API no Bruno ou com Vitest (`vitest.unit.config.ts`).
