# Onda 9 — Correção Crítica de Plataforma (RLS / `executeWithRls`)

## Tentativa 1 (worktree isolado) — bloqueada

Executada em worktree isolado, sem Docker/Postgres disponível ali. Não foi possível rodar
`tests/integration/threecx-persistence.test.ts` contra banco real; a investigação ficou limitada a
leitura de código e à hipótese registrada nos handoffs da Onda 7 (array-form
`basePrisma.$transaction([setConfig, prismaPromise])` em `executeWithRls`,
`src/lib/prisma.ts`, como possível causa da perda de visibilidade entre `requestContext.run()`
separados). Hipótese **não verificada** nessa tentativa.

## Tentativa 2 (repo principal, branch `agente/01A-rls-critico-onda9`) — bug reproduzido e corrigido

### Ambiente

- `docker ps` confirmou `atlas_postgres` (porta 5434), `atlas_redis`, `atlas_meilisearch` já no ar.
- `git status` tinha uma modificação pré-existente não relacionada
  (`.agents/COMO-CHAMAR-OS-AGENTES.md`, documentação da própria Onda 9) — não tocada por este
  agente.
- Branch criada: `git checkout -b agente/01A-rls-critico-onda9`.
- Setup: `node scripts/test/prepare-integration-env.js && npx dotenv-cli -e .env.test -- npx prisma
  migrate deploy` — aplicou 1 migration pendente (`20260815020000_bitrix_extraction_run`), sem
  erros.

### Passo 1 — reprodução isolada, antes de qualquer mudança de código

`npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts
tests/integration/threecx-persistence.test.ts` (arquivo intocado, com os dois testes ainda
`it.skip`) rodou 3 passed / 2 skipped — **sem falha**, porque os dois testes que reproduziam o bug
já estavam skipados desde a Onda 7 (comentários no próprio arquivo apontam para os handoffs
07-para-01 e 13-para-01).

Reabilitei os dois `it.skip` → `it` (mesmos nomes, mesmo corpo, nenhuma alteração de asserção
nesse primeiro passo) e rodei de novo: **2 falhas reproduzidas de forma determinística**, batendo
exatamente com o que a Onda 7 relatou:

- `cifra apiKey/apiSecret em repouso — a linha crua no banco não contém o segredo em texto puro`:
  `expected [] to have a length of 1 but got +0`.
- `RLS: uma conexão da organização A é invisível no contexto de tenant da organização B...`:
  `expected undefined to be defined`.

Observação lateral (não relacionada ao bug de RLS, mas bloqueava a suíte antes mesmo de chegar
nesses 2 testes): `.env.test` local não tinha `CREDENTIALS_ENCRYPTION_KEY`, então o processo caía
no fallback de `.env` (não `.env.test`) que tinha o placeholder literal
`CREDENTIALS_ENCRYPTION_KEY=replace-with-openssl-rand-base64-32` (26 bytes decodificados, não 32) —
`resolveKey()` em `src/lib/crypto/secretFields.ts` rejeitava essa chave. Corrigido gerando uma
chave de 32 bytes real e adicionando a `.env.test` (arquivo local, gitignored, não é segredo real).
Documentado aqui porque bloqueava a reprodução, não é parte do bug de RLS em si.

### Passo 2 — causa raiz real (não é o array-form do `$transaction`)

Investigação com instrumentação temporária (`$on('query')` no `basePrisma`, comparação de
`pg_backend_pid()`, scripts isolados fora do Vitest) mostrou que:

1. **A hipótese registrada nos handoffs da Onda 7 estava errada.** Troquei `executeWithRls` de
   array-form (`basePrisma.$transaction([setConfig, prismaPromise])`) para transação interativa
   (`basePrisma.$transaction(async (tx) => { await tx.$executeRawUnsafe(setConfig...); return
   build(tx); })`, com todos os call-sites internos passando a construir a operação a partir do
   `client`/`tx` recebido em vez de uma `PrismaPromise` pré-construída) — mudança arquiteturalmente
   correta e documentada como o padrão recomendado do Prisma para RLS, mas **o sintoma persistiu
   idêntico** com as duas formas. Isso descartou a hipótese do array-form como causa raiz.
2. Instrumentação mais profunda (logging de SQL real, comparando o valor devolvido por
   `requestContext.getStore()` dentro do callback do teste com o valor efetivamente usado no
   `set_config` da query) revelou a causa raiz verdadeira: **`PrismaClient` devolve uma
   `PrismaPromise` *lazy*** — um thenable customizado que só começa a executar de verdade quando
   `.then()`/`await` é chamado por quem consome o valor, não quando `.create()`/`.findMany()` é
   invocado. O padrão usado em todo o código de teste (e, por extensão, potencialmente em código de
   produção) —
   ```ts
   const asOrg = (id, fn) => requestContext.run({ tenantId: id }, fn);
   await asOrg(ORG_A, () => prisma.model.findMany(...));
   ```
   — devolve a `PrismaPromise` lazy de dentro do callback de `requestContext.run()` **sem dar
   `await` nela internamente**. `AsyncLocalStorage.run(store, callback)` do Node só garante a store
   ativa durante a extensão síncrona do `callback` (mais qualquer continuação de Promise nativa
   iniciada durante essa extensão). Como o `callback` aqui só constrói e devolve a `PrismaPromise`
   (sem `await`), no momento em que o `.then()` real dispara (no `await` externo, já fora do
   `run()`), a store ativa pode já ser outra — no caso reproduzido, o `beforeEach` global de
   `tests/helpers/integration-setup.ts` chama `requestContext.enterWith({tenantId: 'test-org-id'})`
   (mutação persistente, não escopada), e esse era o valor que a query real via.

   Confirmado isoladamente, sem Prisma, com um thenable customizado equivalente:
   ```js
   const lazyOp = () => ({ then(resolve) { setTimeout(() => resolve(als.getStore()), 10); } });
   als.enterWith('outer-leaked-context');
   const result = await als.run('ORG_A', () => lazyOp());
   // result === 'outer-leaked-context', não 'ORG_A'
   ```
   E confirmado que envolver o callback de `run()` numa função `async` que dá `await` internamente
   resolve o problema (`als.run(store, async () => await fn())` devolve corretamente `'ORG_A'`).

### Passo 3 — correção aplicada (sem afrouxar RLS)

Dois arquivos do meu domínio exclusivo (`src/lib/prisma.ts`, `src/lib/async-context.ts`) alterados:

1. **`src/lib/async-context.ts`**: `requestContext` passa a ser uma subclasse
   `TenantAwareAsyncLocalStorage extends AsyncLocalStorage<RequestContext>` que sobrescreve `run()`
   — quando o callback devolve algo "thenable", envolve o resultado numa função `async` que dá
   `await` nele imediatamente, ancorando a store correta durante toda a execução real da
   query/lazy-promise. Isso corrige o problema **uma única vez, no ponto central**, sem precisar
   tocar em cada um dos vários `asOrg`/`withRlsBypass` espalhados pelo código (que continuam
   funcionando exatamente como estão escritos, em produção e em outros arquivos de teste). Callbacks
   que não devolvem promise continuam idênticos, sem overhead extra de microtask.
2. **`src/lib/prisma.ts`**: `executeWithRls` migrado de array-form `$transaction` para transação
   interativa (`$transaction(async (tx) => {...})`), com `SET LOCAL` e a query real sempre
   executados contra o mesmo `tx`/client explícito. Não é a causa raiz do bug reportado pela Onda 7,
   mas é uma correção real e defensável por si só (padrão documentado do Prisma para RLS com
   extensões de client) e elimina qualquer resíduo de ambiguidade sobre em qual conexão física o
   `SET LOCAL` e a query rodam. RLS continua fail-closed: nenhuma policy, nenhuma condição de
   `current_setting`, nenhum comportamento de bypass foi alterado — apenas a mecânica de execução.
3. **`tests/integration/threecx-persistence.test.ts`**: os dois testes reabilitados (`it.skip` →
   `it`), comentários desatualizados sobre "reabilitar quando `executeWithRls` for corrigido"
   atualizados para refletir a causa raiz real. Corrigido também um bug real e pré-existente no
   PRÓPRIO teste de criptografia: `withRlsBypass(() => prisma.$queryRaw(...))` nunca aplicava o
   contexto de tenant/bypass à query crua, porque `$queryRaw`/`$executeRaw` não passam pela extensão
   `$allOperations` (isso já era documentado no comentário de `withRlsContext` em `prisma.ts`, só o
   teste não usava o helper certo). Troquei para `withRlsContext((tx) => tx.$queryRaw...)`, o helper
   já exportado e já correto para SQL cru — sem enfraquecer a asserção (mesma verificação de
   ciphertext em repouso).

Nenhuma policy de RLS foi alterada. Nenhuma asserção de teste foi enfraquecida ou removida — a
única mudança de asserção foi trocar o mecanismo de aplicar o contexto de tenant numa query crua
pelo helper correto que já existia no código.

### Passo 4 — prova com testes reais (execução real, não leitura de código)

- `tests/integration/threecx-persistence.test.ts` sozinho, **5 execuções consecutivas**: 5/5 com
  "5 passed" em todas — sem flakiness.
- Suíte de integração completa (`npm run test:integration`, todos os 18 arquivos), **3 execuções
  consecutivas**: "18 passed / 73 passed" nas três, sem flakiness.
- `npm run test:unit`: 140 arquivos / 1048 testes, todos passando.
- `npx tsc --noEmit -p .`: sem erros.
- `npm run lint`: 0 erros, 101 warnings — todos pré-existentes (nenhum nos arquivos tocados por este
  agente).
- `npm run build`: build de frontend + servidor concluído sem erros.

### Status final

**Corrigido e verificado com execução real contra Postgres real**, não apenas por leitura de
código. Causa raiz não era onde a Onda 7 apontou (array-form do `$transaction`), mas um problema
mais fundamental de interação entre `AsyncLocalStorage` e `PrismaPromise` lazy — corrigido no ponto
central (`async-context.ts`) para proteger qualquer uso futuro do mesmo padrão `requestContext.run
(store, () => prisma.op(...))` em qualquer parte do código, não só nos testes desta suíte.

### Arquivos alterados

- `src/lib/async-context.ts` (meu, exclusivo)
- `src/lib/prisma.ts` (meu, exclusivo)
- `tests/integration/threecx-persistence.test.ts`
- `.env.test` (local, gitignored — chave de criptografia de dev corrigida, não é segredo real)

### Handoffs adicionais (Onda 7, direcionados a "01") — não abertos nesta tentativa

Não sobrou tempo para revisar os handoffs de proveniência/schema de cadência mencionados no
prompt (`.agents/handoffs/onda-7/` outros itens direcionados a "01"), dado o tamanho da
investigação de causa raiz. Fica para uma próxima sessão dentro do domínio do Agente 01/01A.
