- De: Agente 07 (IA, RAG, Filas e Automações)
- Para: Agente 01 (Plataforma, Segurança e Dados) — dono de `src/lib/prisma.ts`/RLS/conexão Postgres
- Onda: 7
- Status: resolvido (Onda 9, Agente 01A, commit `2616a4d1` — ver `.agents/runs/onda-9.md` e
  `src/lib/async-context.ts::TenantAwareAsyncLocalStorage`)
- Prioridade: alto (não bloqueia esta onda — descrito abaixo — mas limita a confiabilidade de testes de integração futuros em qualquer domínio)

## Resolução (Onda 9, Agente 01A)

A causa raiz não estava na conexão/pool com o Postgres nem na forma array de `$transaction` em
`executeWithRls` (hipóteses levantadas abaixo — testadas e descartadas com execução real). É uma
interação entre `AsyncLocalStorage.run()` e a natureza *lazy* de `PrismaPromise`: um callback que
devolve a promise sem `await` interno perde a store correta antes da query executar de verdade.
Corrigido de forma centralizada em `src/lib/async-context.ts`
(`TenantAwareAsyncLocalStorage`), sem exigir mudança em nenhum call site individual. Detalhes
completos em `.agents/runs/onda-9.md`.

## Problema

Ao escrever um teste de integração para o novo gatilho de estagnação (`stagnation-scanner.service.ts`),
tentei criar uma segunda `Organization` (`test-stagnation-org-b`) **dentro do teste** (via
`requestContext.run({ bypassRls: true }, ...)`, mesmo padrão já usado por
`tests/integration/knowledge-rag-tenant-isolation.test.ts`) e, logo em seguida, criar um `Automation`
referenciando essa organização (`requestContext.run({ tenantId: 'test-stagnation-org-b' }, () =>
prisma.automation.create(...))`).

Isso falhou de forma determinística com:
```
DriverAdapterError: new row violates row-level security policy for table "Automation"
```

Investigando a fundo (isolei em testes mínimos, sem nenhum código meu no meio — só
`prisma.organization.create` + `prisma.organization.findUnique`/`prisma.lead.create`/
`prisma.automation.create` direto, com `requestContext` de verdade), o comportamento observado foi:

1. Criar uma `Organization` nova **dentro de um teste** (depois que o `beforeEach` global de
   `tests/helpers/integration-setup.ts` já chamou `requestContext.enterWith({ tenantId: 'test-org-id' })`)
   e imediatamente usá-la (seja lendo a própria `Organization` de volta, seja criando um `Lead` ou
   `Automation` nela) **às vezes falha** com violação de RLS na tabela filha, e **às vezes** o
   `create()` da própria `Organization` nem lança erro, mas a linha nunca aparece no banco depois
   (confirmei via `psql` direto — a linha simplesmente não persiste, apesar de `create()` resolver
   sem exceção).
2. O mesmo padrão (`Organization` criada em `beforeAll`, ANTES de qualquer `enterWith`) funciona
   sempre — é assim que `test-org-id` (pré-seedado) se comporta em toda a suíte, de forma
   perfeitamente confiável.
3. `ingestionService.ingestText` (usado por `knowledge-rag-tenant-isolation.test.ts`) — que só faz
   `prisma.document.create(...)` referenciando a organização recém-criada, sem nunca reler a própria
   `Organization` — funciona de forma confiável (rodei 3× seguidas). Criar um `Lead`/`Automation` do
   mesmo jeito, no mesmo cenário, falhou em várias tentativas.
4. O comportamento **não é 100% determinístico entre execuções separadas do processo Vitest** — o
   mesmo teste mínimo ora falhou no `create()` da `Organization` (RLS na própria `Organization`), ora
   passou no `create()` mas falhou horas depois ao reler ("undefined"), ora passou inteiro dependendo
   de detalhes que não consegui isolar (ordem exata das chamadas, se havia um `findUnique` de
   "existe?" antes do `create`, etc.).

Isso aponta para algo na camada de conexão/pool com o Postgres (não no meu código do domínio de
automações) — hipóteses que não tive como confirmar sem visibilidade da infraestrutura de conexão:
- o `pg.Pool` (`src/lib/prisma.ts`, `max: 20`) devolvendo uma conexão diferente para o `SELECT
  set_config(...)` e para o `INSERT`/`SELECT` seguinte dentro do MESMO `$transaction([a, b])` (forma
  array, não a forma de callback interativo `withRlsContext`) — o que quebraria totalmente a premissa
  de `set_config(..., true)` (escopo local à transação) valer para a segunda query;
- algo específico do motor novo do Prisma 7 (`@prisma/adapter-pg` + `client-engine-runtime`,
  `clientVersion: "7.9.1"` — visto no stack trace `PgTransaction.performIO`/`query-interpreter.ts`),
  possivelmente uma imaturidade dessa combinação de adapter+engine com `$transaction()` em forma de
  array quando chamado repetidamente em sequência rápida a partir de contextos de
  `AsyncLocalStorage` aninhados (`enterWith` seguido de `run` aninhado);
- um proxy/pooler extra entre a aplicação e o Postgres neste ambiente compartilhado (containers
  `atlas_postgres` reaproveitados entre worktrees, conforme o próprio script de preparação do
  ambiente já avisa: "Containers ... já em execução (compartilhados entre worktrees)").

## Impacto real nesta onda

Não bloqueou minha entrega: a lógica do scanner de estagnação está coberta por 8 testes unitários
determinísticos com Prisma mockado + `requestContext` real (asserts sobre o `tenantId` setado durante
a chamada), o que valida a lógica de negócio sem depender deste comportamento de banco. O teste de
integração de ponta a ponta que eu queria escrever (criar uma segunda organização no teste e provar
isolamento de tenant com Postgres de verdade para `Automation`/`Lead`) teve que ser abandonado por não
conseguir rodar de forma confiável — removi o arquivo (`automation-stagnation-scanner.test.ts`) em vez
de deixar um teste flaky no repositório.

## Arquivo(s) envolvido(s)
- `src/lib/prisma.ts` — `executeWithRls`, especificamente o uso de `basePrisma.$transaction([raw,
  query])` (forma array) em vez de `basePrisma.$transaction(async (tx) => {...})` (forma callback,
  usada por `withRlsContext` no mesmo arquivo, que parece ser o caminho "seguro" já usado para SQL
  cru).
- Possivelmente configuração do `pg.Pool`/do ambiente de conexão de teste.

## Alteração necessária (sugestão, não prescritiva)
1. Reproduzir com um teste mínimo isolado (não preciso escrever de novo — descrevi o cenário exato
   acima; o mais direto: `Organization.create()` seguido de `Organization.findUnique()` para o MESMO
   id, cada um em seu próprio `requestContext.run(...)`, repetido em loop dentro de um teste de
   integração, para ver a taxa de falha).
2. Se confirmado que é a forma array de `$transaction`, considerar migrar `executeWithRls` para a
   forma de callback interativo (`$transaction(async (tx) => { await tx.$executeRawUnsafe(...); return
   query-equivalente-em-tx(...); })`), que é o padrão que `withRlsContext` já usa com sucesso — mas
   isso exige reescrever `query(args)` para rodar dentro do `tx` em vez de `basePrisma`, o que pode não
   ser trivial dado como a extensão intercepta `$allOperations`.
3. Alternativa mais barata: investigar se `pg.Pool` precisa de `max: 1` (ou uma trava explícita de
   conexão) neste ambiente de teste especificamente, ou se há um proxy de conexão no meio que quebra a
   premissa de "mesma conexão física" que `$transaction([...])` normalmente garante.

## Teste esperado
Um teste de integração que cria uma `Organization` nova dentro do próprio teste (não só em
`beforeAll`) e imediatamente cria/lê registros dependentes dela (em qualquer tabela sob RLS) deveria
passar 100% das vezes, em execuções repetidas, sem flakiness.

## Contexto adicional
Não é um problema introduzido por mim nesta onda — reproduzi com código isolado, sem nenhuma
dependência do meu domínio (automações/RAG/filas). `tests/helpers/integration-setup.ts`,
`tests/integration/knowledge-rag-tenant-isolation.test.ts` e `src/lib/prisma.ts` já existiam antes da
Onda 7. Deixo aqui documentado porque a Onda 7 foi onde eu precisei pela primeira vez criar uma
segunda organização a partir de um teste fora do padrão "só ingestão de Documento", e isso expôs o
comportamento.
