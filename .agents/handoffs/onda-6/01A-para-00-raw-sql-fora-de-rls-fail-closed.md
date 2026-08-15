- De: Agente 01A (Confiabilidade de Dados, RLS e Retenção)
- Para: Agente 00 (Coordenador) — triar para 05 (Prospecção)
- Onda: 6
- Status: resolvido
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

## Resolução

- Agente: 05 (Prospecção), remediação pontual pós-Onda 6.
- Branch: `agente/05-fix-rls-raw-sql`.

### O que foi feito

1. **As 3 chamadas envolvidas em `withRlsContext`**, exatamente no padrão já usado em
   `vectorStore.ts`/`search.service.ts`/`whatsappMessage.service.ts`:
   - `src/features/prospecting/services/lookalike-scoring.service.ts`
     - `updateCompanyProfileEmbedding`: `prisma.$executeRaw` → `withRlsContext((tx) =>
       tx.$executeRaw...)`.
     - `computeLookalikeScore`: os dois `prisma.$queryRaw` (fetch do embedding-alvo e busca de
       vizinhos "Negócios Ganhos") → `withRlsContext((tx) => tx.$queryRaw...)`.
   - `src/features/prospecting/services/prospecting.service.ts`
     - `findExistingCompany`: `prisma.$queryRaw` (dedupe por CNPJ via `regexp_replace`) →
       `withRlsContext((tx) => tx.$queryRaw...)`.
   - O filtro explícito de `organizationId` já existente em todas as 3 queries foi preservado
     (defesa em profundidade) — nada foi removido, só o contexto de tenant que faltava foi
     adicionado.

2. **Bug adicional encontrado e corrigido, no mesmo ponto da correção acima** (fora do escopo
   original do handoff, mas necessário para a dedup por CNPJ funcionar de verdade — sem ele, o
   teste de integração pedido neste handoff não conseguiria provar a funcionalidade real): em
   `findExistingCompany`, o padrão regex `'\D'` dentro do template literal do `$queryRaw` usava
   **uma única barra invertida**. Um template literal comum do JavaScript processa escapes na
   string "cooked" (não usa `strings.raw`), e `\D` não é uma sequência de escape reconhecida — o
   parser descarta a barra e o texto que chega ao Postgres via Prisma vira só `D` (letra literal,
   nunca presente num CNPJ). Isso fazia `regexp_replace(cnpj, 'D', '', 'g')` nunca normalizar nada,
   e a busca por CNPJ falhava silenciosamente mesmo já com o contexto de tenant certo. Confirmado
   empiricamente contra Postgres real (isolando cada peça: `withRlsContext` funcionando
   corretamente, mas o `regexp_replace` devolvendo o CNPJ inalterado). Corrigido para `'\\D'`
   (barra dupla no código-fonte → uma barra de verdade chega ao Postgres). Comentário explicativo
   deixado no código-fonte no ponto exato da correção.
   - Esse mesmo padrão (`'\D'` com barra simples) existe também em
     `src/features/integrations/whatsapp/whatsappMessage.service.ts::findContactByPhone` (marcado
     como "Correto" na tabela de varredura acima, por já usar `withRlsContext`) — não foi tocado
     por estar fora do escopo desta remediação (módulo de outro agente), mas pelo mesmo raciocínio
     estrutural é provável que a normalização de telefone ali tenha o mesmo bug de escaping e
     também não normalize nada de verdade hoje. Sinalizando para triagem do Agente 00/coordenador;
     recomendo um handoff específico para o dono daquele módulo confirmar e corrigir.

3. **Teste de integração novo**: `tests/integration/prospecting-rls.test.ts`, rodando contra
   Postgres real (RLS/FORCE ROW LEVEL SECURITY ativa, sem bypass nas operações sob teste). Cobre:
   - `updateCompanyProfileEmbedding` grava o embedding de verdade (UPDATE afeta 1 linha, não 0).
   - `computeLookalikeScore` encontra vizinhos reais ("Negócios Ganhos" do mesmo tenant), calcula
     um score > 0 e persiste `lookalikeScore`/`lookalikeTopMatches` na `Company`.
   - Não-regressão de isolamento: vizinhos "Negócios Ganhos" de **outro** tenant nunca entram no
     cálculo (um tenant com só 1 vencedora continua em cold-start/`null`, mesmo com 3 vencedoras
     "emprestáveis" de outro tenant existindo no banco).
   - `findExistingCompany` (via `promoteToCrm`) reaproveita uma `Company` já cadastrada mesmo com o
     CNPJ gravado num formato de pontuação diferente do CNPJ buscado.
   - Não-regressão de isolamento: o mesmo CNPJ cadastrado em **outro** tenant nunca é reaproveitado
     (cria uma `Company` nova em vez de vazar/reaproveitar a do outro tenant).
   - Regressão verificada manualmente: revertendo só os 2 arquivos de produção (`git stash`) com o
     teste already-escrito em vigor, exatamente as 3 chamadas do handoff voltam a falhar (`UPDATE`
     afeta 0 linhas, `computeLookalikeScore` volta a `null`, dedupe por CNPJ cria duplicata) — os 2
     testes de não-regressão de isolamento continuam passando mesmo sem a correção, confirmando o
     diagnóstico original: é fail-closed (funcionalidade morta), nunca vazamento cross-tenant.

4. **Testes unitários existentes atualizados** (mockavam `prisma.$queryRaw`/`$executeRaw`
   diretamente; agora mockam `withRlsContext`, no mesmo padrão de
   `tests/unit/lib/ai/vectorStore.test.ts`):
   - `tests/unit/features/prospecting/services/lookalike-scoring.service.test.ts`
   - `tests/unit/features/prospecting/services/prospecting.service.dedupe.test.ts`
   - `tests/unit/features/prospecting/services/prospecting.service.test.ts`

### Resultado dos testes

- **Antes da correção** (3 chamadas fora de `withRlsContext`): `tests/integration/prospecting-rls.test.ts`
  — 3 de 5 testes falhando exatamente como descrito no handoff (`updateCompanyProfileEmbedding`
  retorna `false`, `computeLookalikeScore` retorna `null`, dedupe por CNPJ cria uma `Company`
  duplicada em vez de reaproveitar); os 2 testes de não-regressão de isolamento passam mesmo sem a
  correção (confirma fail-closed, não vazamento).
- **Depois da correção**: `tests/integration/prospecting-rls.test.ts` — 5/5 testes passando.
- `npm run test:integration` (suíte completa, Postgres real via `atlas_postgres`/porta 5434):
  14 arquivos, 53 testes — todos passando.
- `npm run test:unit`: 109 arquivos, 708 testes — todos passando.
- `npx tsc --noEmit`: sem erros.
- `npm run lint`: 0 erros, 101 warnings (todos pré-existentes, nenhum novo introduzido por esta
  mudança — mesma contagem antes/depois).

### Arquivos alterados

- `src/features/prospecting/services/lookalike-scoring.service.ts`
- `src/features/prospecting/services/prospecting.service.ts`
- `tests/integration/prospecting-rls.test.ts` (novo)
- `tests/unit/features/prospecting/services/lookalike-scoring.service.test.ts`
- `tests/unit/features/prospecting/services/prospecting.service.dedupe.test.ts`
- `tests/unit/features/prospecting/services/prospecting.service.test.ts`
