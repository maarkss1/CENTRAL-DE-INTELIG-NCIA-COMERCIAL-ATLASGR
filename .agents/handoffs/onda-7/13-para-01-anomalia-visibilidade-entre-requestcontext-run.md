- De: Agente 13 (Enxame Autônomo e Governança de Agentes)
- Para: Agente 01 (Plataforma, Segurança e Dados)
- Onda: 7
- Status: resolvido (Onda 9, Agente 01A, commit `2616a4d1` — ver `.agents/runs/onda-9.md` e
  `src/lib/async-context.ts::TenantAwareAsyncLocalStorage`)
- Prioridade: normal

## Resolução (Onda 9, Agente 01A)

Causa raiz confirmada com execução real contra Postgres (não só leitura de código): **não** é a
forma array de `$transaction` em `executeWithRls` (essa hipótese foi testada e descartada). É uma
interação entre `AsyncLocalStorage.run(store, callback)` e o fato de `PrismaClient` devolver uma
`PrismaPromise` *lazy* — quando `callback` só constrói e devolve a promise sem `await` interno
(padrão usado por `asOrg`/`withRlsBypass` em todo o código), a store de `run()` já não está mais
ativa no momento em que o `.then()` real dispara, então a query vê o contexto ambiente errado (ex.:
sobrescrito por `enterWith` de um hook global). Corrigido de forma centralizada com
`TenantAwareAsyncLocalStorage` (subclasse de `AsyncLocalStorage` que envolve qualquer retorno
thenable do callback numa função `async` com `await` interno) em `src/lib/async-context.ts` — um
único ponto de correção, sem precisar tocar nos vários call sites espalhados pelo código. Detalhes
completos, incluindo a reprodução isolada sem Prisma, em `.agents/runs/onda-9.md`.

## Problema

Ao escrever `tests/integration/swarm-autonomous-mission-e2e.test.ts` (Postgres real, sem mock de
Prisma), encontrei um comportamento reproduzível e não intuitivo em `src/lib/prisma.ts` →
`executeWithRls`: um `prisma.<model>.create(...)` bem-sucedido (a promise resolve com a linha
criada, incluindo o `id` real) **não fica visível** para uma leitura (`findMany`) feita logo depois,
**se** a leitura acontecer dentro de um **novo `requestContext.run(...)` de nível superior**,
separado do `.run(...)` que envolveu a escrita — mesmo com `bypassRls: true` na leitura.

Reproduzi isolando o caso (fora do meu domínio de agentes, só Prisma + `requestContext` puro):

- Escrita e leitura no **mesmo** `requestContext.run(...)` (ou leitura **aninhada** dentro dele) →
  sempre visível.
- Escrita em um `.run(...)` que termina e retorna, seguida de uma leitura em um **segundo**
  `.run(...)` separado (ainda que ambos `await`ados corretamente, sem paralelismo) → a leitura
  volta vazia, mesmo consultando via `psql` direto no container logo em seguida.

Isso é consistente com `executeWithRls` (linha ~160 de `src/lib/prisma.ts`) envolver cada operação
em `basePrisma.$transaction([setConfig, prismaPromise])` — index array-form. Minha suspeita (não
confirmada) é alguma interação entre o adapter `@prisma/adapter-pg` + o pool (`max: 20`,
`allowExitOnIdle: true`) e como transações batched em array-form fazem commit/liberam a conexão
neste ambiente de teste — mas não investiguei a causa raiz a fundo, é fora do meu domínio
(`src/lib/prisma.ts` não está no meu escopo da onda).

## Arquivo(s) envolvido(s)

- `src/lib/prisma.ts` (seu, exclusivo) — função `executeWithRls`.

## Alteração necessária

Investigação de causa raiz recomendada, mas **não bloqueadora** desta onda: contornei o problema no
meu teste envolvendo escrita+leitura no mesmo `requestContext.run(...)` de nível superior (padrão
que já é usado, sem problema, no teste pré-existente `tests/integration/tenant-isolation-db001.test.ts`).
Se esse padrão de `.run()` aninhado for necessário em **produção** também (ex.: um worker que abre
contexto, faz uma escrita, fecha o contexto, e outra parte do sistema abre um contexto novo para ler
o que acabou de ser escrito, com um tempo curto entre as duas), vale confirmar que não há uma janela
real de inconsistência aí — no meu domínio isso não acontece (o scheduler sempre lê o que escreveu
dentro do mesmo `.run()`), mas pode valer para outros consumidores do Prisma estendido.

## Teste esperado

Um teste de integração mínimo, fora do meu domínio, que isole exatamente esse caso (dois
`requestContext.run()` sequenciais, não aninhados, escrita no primeiro, leitura no segundo) ajudaria
a decidir se é comportamento esperado do ambiente de teste (containers compartilhados entre até 8
worktrees) ou um bug real de `executeWithRls`.

## Contexto adicional

Não bloqueei minha entrega por causa disso — o teste ponta a ponta da missão real do enxame
(`swarm-autonomous-mission-e2e.test.ts`) passa de forma estável seguindo o padrão de `.run()` único.
Registro aqui porque é uma anomalia real de plataforma que vale a pena entender, não porque afeta
meu domínio hoje.
