- De: Agente 01A (Confiabilidade de Dados, RLS e Retenção)
- Para: Agente 00 (Coordenador) — triar para 05 (Prospecção)
- Onda: 6
- Status: aberto
- Prioridade: alto

## Problema
Varredura completa de `$queryRaw`/`$executeRaw`/`$queryRawUnsafe` (item 2 da minha missão) achou 3
ocorrências que rodam `prisma.$executeRaw`/`prisma.$queryRaw` **fora** de `withRlsContext`, no
mesmo padrão de bug que já foi corrigido em `vectorStore.ts`, `whatsappMessage.service.ts` e
`search.service.ts` nas Ondas 1/2 (ver comentário em `src/lib/prisma.ts:303-306`):
`$executeRaw`/`$queryRaw` não passam pela extensão `$allOperations`, então rodam numa conexão sem
`app.current_tenant_id` setado.

**Não é vazamento cross-tenant** — confirmei empiricamente (script descartável, banco real) que a
policy `FORCE ROW LEVEL SECURITY` de `Company` é fail-closed: sem `app.current_tenant_id` setado, a
query devolve **zero linhas**, nunca linhas de outro tenant. É um bug funcional silencioso: estas
três chamadas hoje sempre retornam vazio em produção, quebrando a feature que dependem delas.

## Arquivo(s) envolvido(s) — fora do meu escopo exclusivo (não são prisma.ts/tenant-prisma.ts/async-context.ts)
1. `src/features/prospecting/services/lookalike-scoring.service.ts`
   - `updateCompanyProfileEmbedding` (linha ~57): `UPDATE "Company" SET "profileEmbedding" = ...`
     sempre afeta 0 linhas → o embedding de perfil da empresa nunca é gravado de verdade.
   - `computeLookalikeScore` (linhas ~93 e ~99): os dois `SELECT` sempre devolvem vazio →
     `computeLookalikeScore` sempre retorna `null` (a função nunca funciona, silenciosamente, desde
     que foi escrita).
2. `src/features/prospecting/services/prospecting.service.ts`
   - `findExistingCompany` (linha ~268): o `SELECT id FROM "Company" WHERE ... regexp_replace(cnpj,
     ...) = $cnpj` sempre devolve vazio → a deduplicação por CNPJ normalizado nunca encontra a
     empresa já cadastrada, e `promote` provavelmente cria uma `Company` duplicada toda vez que o
     CNPJ está formatado diferente do que já existe no banco.

## Alteração necessária
Envolver as 3 chamadas com `withRlsContext` (`src/lib/prisma.ts`), exatamente como já foi feito em
`vectorStore.ts`/`search.service.ts`/`whatsappMessage.service.ts` — trocar `prisma.$executeRaw`/
`prisma.$queryRaw` por `withRlsContext((tx) => tx.$executeRaw...)` / `withRlsContext((tx) =>
tx.$queryRaw...)`. O filtro explícito de `organizationId` já existe nas 3 queries (defesa em
profundidade correta) — só falta o contexto de tenant real.

## Teste esperado
- `computeLookalikeScore`/`updateCompanyProfileEmbedding` com um `organizationId` real e RLS ativa
  (não bypass) devem afetar/retornar linhas quando a empresa existe no tenant certo.
- `findExistingCompany` deve encontrar uma `Company` existente cujo CNPJ está gravado com
  pontuação diferente do CNPJ de busca.
- Teste de não-regressão cross-tenant (RLS continua bloqueando `organizationId` de outro tenant)
  no mesmo padrão dos testes já existentes de `tenant-isolation-db001.test.ts`.

## Tabela completa da varredura de SQL cru (item 2 da minha missão — todas as ocorrências, inclusive as corretas)

| Arquivo | Linha(s) | Dentro de `withRlsContext`/`requestContext`? | Filtra `organizationId` explícito? | Leitura/Escrita | Classificação |
|---|---|---|---|---|---|
| `src/lib/prisma.ts` | 170 | É o próprio mecanismo (`executeWithRls`, dentro de `$transaction`) | N/A | set_config | Correto — é a implementação da proteção |
| `src/lib/prisma.ts` | 315 | É o próprio mecanismo (`withRlsContext`) | N/A | set_config | Correto — é a implementação da proteção |
| `src/lib/ai/vectorStore.ts` | 46 | Sim (`withRlsContext`) | Sim (via `Document`, RLS de `DocumentChunk` já filha de `Document`) | Escrita | Correto |
| `src/lib/ai/vectorStore.ts` | 73 | Sim (`withRlsContext`) | Sim (join com `Document.organizationId`) | Leitura | Correto |
| `src/features/knowledge/ingestion.service.ts` | 126, 139, 215, 222, 230 | Sim (`withRlsContext`) | Indireto (documentId já validado por tenant antes) | Escrita | Correto |
| `src/features/knowledge/ingestion.service.ts` | 297 | Sim (`withRlsContext`) | Indireto (documentId já validado por tenant antes) | Leitura | Correto |
| `src/features/knowledge/ingestion.service.ts` | 309 | Sim (`withRlsContext`) | Indireto (chunkId já validado) | Escrita | Correto |
| `src/features/knowledge/search.service.ts` | 101, 131, 152 (+ fallback ILIKE) | Sim (`withRlsContext`) | Sim (`WHERE d."organizationId" = ...`) | Leitura | Correto |
| `src/features/knowledge/vector-support.ts` | 18 | Não | N/A — checa `pg_extension`, não dado de tenant | Leitura | Correto (não é dado de tenant) |
| `src/features/integrations/whatsapp/whatsappMessage.service.ts` | 41 | Sim (`withRlsContext`) | Sim (`WHERE "organizationId" = ...`) | Leitura | Correto |
| `src/features/prospecting/services/lookalike-scoring.service.ts` | 57 | **Não** | Sim (`WHERE id = ... AND "organizationId" = ...`) | Escrita | **Bug — fail-closed, 0 linhas afetadas sempre** |
| `src/features/prospecting/services/lookalike-scoring.service.ts` | 93 | **Não** | Sim | Leitura | **Bug — sempre vazio** |
| `src/features/prospecting/services/lookalike-scoring.service.ts` | 99 | **Não** | Sim | Leitura | **Bug — sempre vazio** |
| `src/features/prospecting/services/prospecting.service.ts` | 268 | **Não** | Sim | Leitura | **Bug — sempre vazio, dedup de CNPJ não funciona** |
| `scripts/verify-prod.ts` | 10 | Não | N/A — `SELECT 1`, health check sem dado de tenant | Leitura | Correto (não é dado de tenant) |
| `server.ts` | 300 | Não | N/A — `SELECT 1`, readiness probe sem dado de tenant | Leitura | Correto (não é dado de tenant) |

**Resumo:** 16 ocorrências reais de SQL cru no código de produção (fora de `tests/**`), 13 corretas
(2 são a própria implementação do mecanismo, 9 usam `withRlsContext` + filtro explícito, 2 são
health checks sem dado de tenant), 3 com o mesmo bug (fail-closed, funcional, não é vazamento).

## Contexto adicional
Confirmação empírica de fail-closed feita com script descartável contra `prospectordb_test` real
(Postgres com `FORCE ROW LEVEL SECURITY`, mesma policy de produção):
```
--- Sem NENHUM contexto de tenant setado nesta conexão ---
Resultado: []
--- Contexto setado para Org A, tentando ler organizationId=OrgB ---
Resultado: [] (não vaza)
--- SELECT * sem WHERE, contexto Org A ---
Resultado: só a linha de Org A
```
Isso é consistente com a policy `tenant_isolation_policy` de `Company`
(`prisma/migrations/20260722020322_enable_rls/migration.sql`): `current_setting(...) =
"organizationId"` nunca é verdadeiro com `current_setting` NULL, então a ausência de contexto
bloqueia tudo — nunca libera tudo. Isto reduz a severidade de bloqueador de tenancy para bug
funcional silencioso, mas ainda merece correção (a feature de lookalike scoring e a deduplicação de
empresa por CNPJ estão efetivamente mortas em produção hoje).
