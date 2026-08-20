# Onda 32 — AI-002: checkpointer real de LangGraph

## Contexto

Item 12/15 da rodada "resolver todas as pendências" (`docs/AI-SWARM-GOVERNANCE-AUDIT.md`, Sprint
07). Segue o merge de AI-003 (PR #206).

**Estado de entrada (auditoria, onda 20)**: 3 grafos LangGraph com checkpointer
(`sdrQualification.agent.ts`, `ops.agent.ts`, `supervisor.agent.ts` — o coordenador do enxame),
cada um com `MemorySaver` (RAM) como singleton de módulo. Uma correção anterior (mesma onda 20) já
tinha prefixado `thread_id` por `${organizationId}:${sessionId}`, fechando a colisão de checkpoint
entre organizações — mas o estado continuava desaparecendo a cada restart/deploy do processo, sem
nenhum teste de recovery.

## Decisão de design

Duas decisões próprias durante a implementação (nenhuma pergunta de produto em aberto — o "o que
fazer" já estava claro na auditoria; só o "como" precisou de julgamento):

1. **Schema `public`, não um schema dedicado.** Cogitei namespacing (`langgraph_checkpoint`) para
   separar visualmente as tabelas do pacote das gerenciadas por Prisma, mas isso exigiria
   `CREATE SCHEMA` — confirmado possível no papel `prospector_app` neste ambiente de teste
   (`psql` direto), mas não verificável contra o papel real de produção (Supabase) a partir daqui.
   Usar o schema padrão evita esse risco: o papel já comprovadamente tem DDL em `public` (é assim
   que as migrations do Prisma funcionam desde sempre).
2. **Inicialização preguiçosa do `setup()`, não no boot do processo.** Cogitei chamar
   `checkpointer.setup()` uma vez no boot (mesmo padrão de `featureFlagsService.syncRegistry()` em
   `server.ts`), mas há DOIS processos de entrada distintos (`server.ts` e `worker.ts`, que também
   invoca `supervisor.agent.ts` via `swarmScheduler.worker.js`) — memoizar e chamar
   `ensureCheckpointerReady()` de dentro de cada `run()`/`executeMission()` evita depender de
   lembrar de conectar isso às duas sequências de boot (e a qualquer terceira que apareça no
   futuro).

## O que foi construído

- **`src/lib/ai/checkpointer.ts`** (novo) — `PostgresSaver`
  (`@langchain/langgraph-checkpoint-postgres`, dependência nova) sobre um `pg.Pool` DEDICADO (não o
  pool interno de `prisma.ts`, que não é exportado e cuja vida útil não deveria ser acoplada à do
  checkpointer — `PostgresSaver.end()` fecha seu próprio pool, chamar isso no pool do Prisma por
  engano derrubaria a aplicação inteira). `ensureCheckpointerReady()`: memoizado, chamadas
  concorrentes compartilham a mesma promise, uma falha limpa o cache para permitir nova tentativa.
  `process.once('beforeExit', ...)` próprio fechando o pool dedicado no shutdown, mesmo cuidado já
  documentado em `prisma.ts` contra "Called end on pool more than once".
- Os 3 grafos migrados de `new MemorySaver()` para o `checkpointer` compartilhado — troca mínima
  (só a linha `workflow.compile({ checkpointer })` + `await ensureCheckpointerReady()` antes de
  cada `invoke()`/`stream()`), toda a construção de `thread_id`, tratamento de erro e lógica de
  negócio ao redor ficou intocada.
- Tabelas próprias do pacote (`checkpoints`, `checkpoint_writes`, `checkpoint_blobs`,
  `checkpoint_migrations`) — deliberadamente fora do sistema de migrations do Prisma, criadas pelo
  `setup()` do próprio pacote. Confirmado sem colisão com nenhum model existente em `schema.prisma`.

## Fora de escopo (documentado, não construído)

- **RLS nas tabelas do checkpointer**: o pacote fala SQL cru direto no `pg.Pool`, nunca passa pela
  extensão RLS-aware do Prisma — mesmo se eu adicionasse uma policy manualmente, o pacote nunca
  chama `set_config('app.current_tenant_id', ...)`, então a policy só bloquearia tudo (fail-closed
  quebrando o checkpointer, não protegendo dado). Isolamento de tenant continua sendo só o prefixo
  de `thread_id` (em vigor desde a onda 20) — mesmo modelo de confiança já aceito neste repo para
  BullMQ/Redis. Documentado como risco aceito em `docs/AI-SWARM-GOVERNANCE-AUDIT.md`, não uma
  omissão silenciosa.
- **Política de TTL**: o pacote expõe `deleteThread(threadId)`, mas decidir a política de retenção
  (quanto tempo um checkpoint de missão pausada/concluída deveria continuar consultável antes de
  ser apagado) é decisão de produto própria — a auditoria original já enquadrava isso como
  construção de feature separada, não parte desta correção pontual.

## Gate

- `npx tsc --noEmit` — limpo
- `npm run lint` — 0 erros, 89 warnings (baseline herdado, nenhum novo)
- unit: `npx vitest run -c vitest.unit.config.ts` — **192/192 arquivos, 1488/1488 testes**
  (5 casos novos em `tests/unit/lib/ai/checkpointer.test.ts`; `ops.agent.consent.test.ts` atualizado
  com mock do checkpointer, já que o caso "sem leadId" invoca o grafo de verdade)
- integration (Postgres+Redis reais): `npx vitest run -c vitest.integration.config.ts` —
  **44/44 arquivos, 221/221 testes**, incluindo os 3 casos novos de
  `tests/integration/langgraph-checkpointer.test.ts`: `setup()` idempotente; estado gravado por uma
  instância de `PostgresSaver` (pool próprio) é lido de volta por uma SEGUNDA instância
  independente (pool próprio, nunca viu a primeira) — a prova real de "sobrevive a restart", já que
  simular um restart de verdade não é possível dentro do processo de teste; threads diferentes não
  colidem entre si
- `npm run build` e `npm run build:worker` — ambos limpos
- Verificado manualmente contra Postgres real (`psql \dt public.checkpoint*`) que as 4 tabelas do
  pacote foram criadas corretamente no schema `public`, sem colisão com nenhuma tabela do Prisma

## Correção durante a implementação

**Real, pega pelo CI (não localmente)**: `scripts/db/create-app-role.sql` — `prospector_app` já era
DONO do schema `public` (`ALTER SCHEMA public OWNER TO prospector_app`), mas isso NÃO inclui a
permissão de `CREATE SCHEMA`, que é checada em nível de BANCO, não de schema. `PostgresSaver.setup()`
roda `CREATE SCHEMA IF NOT EXISTS "public"` incondicionalmente (mesmo usando o schema padrão já
existente) — e o Postgres checa a permissão de `CREATE SCHEMA` ANTES de checar se o schema já
existe, então o `IF NOT EXISTS` não evita a checagem. Sem `GRANT CREATE ON DATABASE ... TO
prospector_app`, `setup()` falhava com "permission denied for database" (código Postgres 42501).

Passou no gate local porque, numa correção anterior desta mesma rodada (AI-003), eu tinha recriado o
banco de teste local com `CREATE DATABASE prospectordb_test OWNER prospector_app` — um acidente de
bootstrap manual que tornou `prospector_app` DONO DO BANCO ali, não só do schema `public`, mascarando
completamente o problema real. O CI usa `scripts/db/bootstrap-app-role.sh` (que roda
`create-app-role.sql` sem qualquer ownership de banco), e foi ele que pegou o erro de verdade.

**Corrigido**: `GRANT CREATE ON DATABASE %I TO prospector_app` (via `\gexec`, mesmo padrão de
interpolação dinâmica já usado no resto do arquivo) adicionado a `create-app-role.sql`. Revalidado
localmente recriando o banco de teste do ZERO seguindo o MESMO fluxo do CI
(`CREATE DATABASE ... OWNER prospector` — o superusuário de bootstrap, não `prospector_app` — seguido
de `bash scripts/db/bootstrap-app-role.sh`), não o atalho anterior — os 3 testes de integração do
checkpointer passaram contra esse banco corretamente provisionado. Isso também torna a frase "não
pôde ser verificado contra o papel real de produção" (na seção de decisões acima) mais precisa: o
mesmo `GRANT CREATE ON DATABASE` provavelmente também precisa ser aplicado manualmente no Supabase de
produção antes do primeiro deploy desta correção — sinalizado no PR.

Também um bug pequeno e não relacionado no teste de integração: `afterAll` chamava
`secondPool.end()` sem checar se `secondPool` tinha sido criado — se `beforeAll` lançasse antes de
chegar lá (exatamente o caso do CI), o teste falhava com um `TypeError` confuso mascarando o erro
real de permissão. Corrigido com `secondPool?.end()`.

Fora isso, uma iteração no teste unitário novo
(`tests/unit/lib/ai/checkpointer.test.ts`): a primeira versão usava
`vi.fn().mockImplementation(() => ({...}))` (arrow function) para simular `new Pool(...)`/
`new PostgresSaver(...)`, que falha com "is not a constructor" (arrow functions não podem ser
usadas com `new`). Corrigido trocando por `function` nomeada. Uma segunda correção: as duas
variáveis de mock (`poolEndMock`/`setupMock`) precisaram ser declaradas via `vi.hoisted()` — os
`vi.mock(...)` do Vitest são hoisted para o topo do arquivo, então uma `const` declarada antes deles
no código-fonte na verdade só é inicializada DEPOIS deles em tempo de execução, causando
"Cannot access before initialization".

## Skips e flakes

0 — nenhum teste pulado ou instável observado nesta rodada.

## Nota (fora do escopo desta correção)

`base.agent.ts` também tem um `new MemorySaver()` (linha ~73, dentro do método `run()`), mas esse
método é código morto: as 3 subclasses que estendem `BaseAgent` (BDR/Closer/CRM) sobrescrevem
`run()` e delegam para `runWithTools()`, que usa `createReactAgent` sem nenhum checkpointer — não
tem o problema que este item resolve. Não tocado, para não alterar um caminho de código
comprovadamente inalcançável fora do escopo pedido.
