# Relatório — Auditoria completa de N+1 em rotas de listagem (Onda 42, CPI, DEC-21 opção A)

- Onda: 42
- Item: 11
- Status: parcialmente concluído (2 correções aplicadas nesta rodada, 1 achado documentado como
  pendente — ver seção "Pendências")
- Escopo do pedido: levantar TODAS as rotas de listagem (`GET` com coleção paginada) deste CRM,
  auditar cada uma contra o padrão clássico de N+1 (`findMany` + loop com outra query Prisma por
  item), corrigir os casos reais com `include`/`select` nativos do Prisma, confirmar que a correção
  não abre brecha de RLS, e provar com teste que o número de queries caiu.

## Contexto — o que já existia antes desta auditoria

Antes desta rodada só havia uma checagem **heurística** (loop síncrono + chamada Prisma dentro do
loop), documentada em `docs/development/PERFORMANCE_BUDGETS.md` seção 4 ("N+1 e queries lentas —
auditoria superficial, débito derivado"). Essa varredura só tinha encontrado casos em
`src/features/integrations/bitrix/service/{leads,deals,syncRules}.ts` — sincronização **sequencial**
contra a API externa do Bitrix24 (já auditada separadamente em `BITRIX24-LEAD-FLOW-AUDIT.md`), não
N+1 clássico de uma rota HTTP do próprio produto. O próprio documento já registrava que "uma
auditoria completa de N+1 em todas as queries Prisma do CRM... está fora do escopo temporal" daquele
item — é exatamente essa auditoria completa que esta rodada faz.

Não existe um script de lint de arquitetura dedicado a N+1 (`scripts/architecture/` só tem
`check-hotspots.ts`, que audita tamanho de arquivo, e `generate-known-violations-baseline.mjs`, do
dependency-cruiser — nenhum dos dois detecta N+1). A varredura desta rodada foi manual, arquivo por
arquivo, guiada por dois sinais: (1) toda rota `GET` que devolve uma coleção, mapeada a partir de
`router.get(...)` em `src/features/*/routes/` e nos poucos módulos sem essa convenção
(`market-intelligence/server/`, `integrations/*`); (2) uma varredura por regex em todo `src/features`
por `for (const ... of ...)` / `.map(async ...)` combinados com `await prisma.`/`await tx.` próximos,
para achar candidatos fora dos repositórios óbvios.

## Peça de contexto de segurança relevante (`src/lib/prisma.ts`)

Toda operação Prisma que passa pelo client exportado (`prisma`, não `basePrisma`) roda dentro de
`executeWithRls`, que abre uma transação interativa (`basePrisma.$transaction(async (tx) => ...)`),
executa `SET LOCAL app.current_tenant_id`/`app.bypass_rls` e só então a query real — **na mesma
transação**. Isso importa para esta auditoria de duas formas:

1. Qualquer `include`/join adicionado a uma query continua dentro da MESMA transação/contexto de
   RLS da query principal — não precisa (e não deve) de nenhum bypass adicional para funcionar.
2. Cada operação lógica do Prisma já custa no mínimo 2 statements SQL reais (o `SET LOCAL` + a query
   em si) — então eliminar N chamadas por uma só não é só "uma query a menos", é evitar N vezes esse
   custo fixo de transação.

As duas correções desta rodada mantêm `organizationId` explícito no `where` de toda query nova,
exatamente como as versões anteriores — nenhuma delas usa `bypassRls` nem toca no
`BYPASS_RLS_ALLOWED_MODELS`.

---

## 1. Rotas de listagem auditadas

Tabela completa de toda rota `GET` que devolve uma coleção (paginada ou não), com o resultado da
auditoria. "N+1 real" = `findMany`/`groupBy` seguido de outra query Prisma por item da lista, dentro
do caminho de execução da própria rota HTTP.

| Domínio | Rota | Service/Repository | N+1 real? |
|---|---|---|---|
| Leads | `GET /api/crm/leads` | `PrismaLeadRepository.findAllWithFilters` | Não — `include: { company, contact }` |
| Leads | `GET /api/crm/leads/export/csv` | `PrismaLeadRepository.findAllForExport` | Não — `include` |
| Empresas | `GET /api/companies` | `PrismaCompanyRepository.findAllWithFilters` | Não — `include: { contacts, leads }` |
| Contatos | `GET /api/contacts` | `PrismaContactRepository.findAllWithFilters` | Não — `include: { company }` |
| Atividades | `GET /api/activities` | `PrismaActivityRepository.findAllPaginated` | Não — `include: { lead: { company, contact } }` |
| Atividades | `GET /api/activities/templates` | estático (sem DB) | N/A |
| Pipeline/Negócios | `GET /api/crm360/overview` | `PrismaCrm360Repository.getOverviewData` | Não — `$transaction` batch de counts/finds |
| Pipeline/Negócios | `GET /api/crm360/pipelines` | `PrismaCrm360Repository.getPipelines` | Não — `include: { stages: { _count } }` |
| Pipeline/Negócios | `GET /api/crm360/board` | `PrismaCrm360Repository.getBoardLeads` | Não — `include: { company, contact, pipelineStage, dealItems }` |
| Pipeline/Negócios | `GET /api/crm360/products` | `PrismaCrm360Repository.listProducts` | Não |
| Pipeline/Negócios | `GET /api/crm360/deals/:leadId/items` | `PrismaCrm360Repository.getDealItems` | Não — `include: { product }` |
| Documentos | `GET /api/crm360/documents` | `PrismaCrm360Repository.listDocuments` | Não — `include: { lead, company, contact }` |
| Documentos | `GET /api/crm360/documents/:id/versions` | `PrismaCrm360Repository.listDocumentVersions` | Não |
| Mesa de Tratamento | `GET /api/mesa-tratamento/queue` | rota inline, `select` aninhado | Não — `select` com `company`/`contact` embutidos numa query |
| Deals (Comercial Inteligente) | `GET /api/commercial-intelligence/deals` | `PrismaCommercialIntelligenceRepository.findDeals` | Não — `include: { company, pipelineStage, dealItems }` |
| Comercial Inteligente | `GET /api/commercial-intelligence/overview` | `buildExecutiveOverview` | **SIM — corrigido nesta rodada** (ver seção 2.1) |
| Comercial Inteligente | `/pipeline-creation`, `/performance`, `/aging`, `/losses`, `/crm-quality`, `/alerts` | `build*Report` (queries*) | Não — processam em memória o resultado já carregado de `findDeals`/`findStageHistory` |
| Comercial Inteligente | `/leading-indicators` | `buildLeadingIndicators` | **Achado, não corrigido** — ver seção "Pendências" |
| Comercial Inteligente | `/filter-options` | `getFilterOptions` | Não — 5 queries em `Promise.all` (paralelo, não sequencial; nenhuma delas é "1 por item") |
| Comercial Inteligente | `/goals` | `getGoal` | Não |
| Comercial Inteligente | `/deals/:leadId/forecast` | `buildForecastExplain` | Não (item único, fora da definição de "listagem") |
| Market Intelligence | `GET /api/market-intelligence/companies` | `marketIntelligenceService.listCompanies` | Não — `$queryRaw` único com `LIMIT`/`OFFSET`, paginação real em SQL |
| Market Intelligence | `GET /api/market-intelligence/territories` | `territories` | Não — `GROUP BY` em SQL |
| Market Intelligence | `GET /api/market-intelligence/rankings` | `rankings` | Não — `GROUP BY`/`ORDER BY`/`LIMIT` em SQL |
| Market Intelligence | `GET /api/market-intelligence/sources` | `sources` | Não |
| Time | `GET /api/team`, `/team/assignable` | `listTeamMembers`/`listAssignableOwners` | Não |
| Notas | `GET /api/notes` (por lead) | `NoteUseCases.findNotesByLead` → repository | Não |
| Prospecção | `GET /api/prospecting-tools/saved-searches` | rota inline | Não |
| Playbook | `GET /api/playbook/objection-matrix`, `/qualification-matrix` | `PrismaObjectionMatrixRepository`/`PrismaQualificationMatrixRepository` | Não |
| Automações | `GET /api/automations` | `PrismaAutomationRepository.findAllWithFilters` | Não (sem relações — tabela plana) |
| IA / Chatbook | `GET /api/intelligence/chatbook/history` | `listAssistantHistory` | Não |
| Integrações — WhatsApp | `GET /api/integrations/whatsapp/conversations` | `listConversations` | **SIM — corrigido nesta rodada** (ver seção 2.2) |
| Integrações — WhatsApp | `GET /api/integrations/whatsapp/messages`, `/signals` | rota inline | Não |
| Cadência | `GET /api/cadence/opt-outs` | `PrismaOptOutRepository.list` | Não |
| Cadência | `GET /api/cadence/runs` | `PrismaCadenceRunRepository.listByOrganization` | Não — `include: { touchAttempts }` |
| Cadência | `GET /api/cadence/sequences`, `/templates` | rota inline / estático | Não |
| Conhecimento | `GET /api/knowledge` | `ingestionService.list` | Não |
| Billing/Uso de IA | `GET /api/usage` | `usageService.summary` | Não — 4 queries em `Promise.all` (agregações independentes, não "1 por item") |
| Analytics | `/overview`, `/dashboard`, `/cohort` | `analytics.service.ts` / `AnalyticsUseCases.ts` | Não — todo `for (...)` desses arquivos itera sobre arrays já carregados em memória, sem `await prisma` dentro do loop |
| Integrações — Bitrix | rotas de sync (`bitrix.routes.ts`, `service/{leads,deals,syncRules}.ts`) | — | **Já documentado** (ver `PERFORMANCE_BUDGETS.md` seção 4) — sync sequencial contra API externa, não N+1 de rota HTTP própria; fora do escopo desta rodada (ver "Pendências") |

Todas as demais rotas `GET` do app (roleplay, dashboard, gamification, feature-flags, integrações
Google/3CX/Birth Voice, notificações, LGPD, settings) foram varridas pela regex de
`for (const ... of ...)` / `.map(async ...)` + `await prisma`/`await tx` descrita acima e não
produziram nenhum candidato adicional dentro de uma rota de listagem — os únicos hits fora dos dois
casos corrigidos e do já documentado em Bitrix foram todos em **workers/jobs de fila** (rodam fora
do ciclo de request HTTP, nunca dentro de uma resposta de listagem):
`intelligence/services/swarmScheduler.service.ts` (worker `swarmScheduler.worker.ts`),
`integrations/threecx/threecx.service.ts` (webhook `process3CXWebhook`, loop bounded a no máximo 2
números candidatos), `feature-flags/featureFlags.service.ts` (sync no boot do processo, não uma
rota) e `crm/application/LeadDeduplicationService.ts` (não está registrado em nenhum DI container
nem chamado de nenhuma rota/worker hoje — código não conectado a nenhum caminho de execução real).

---

## 2. Correções aplicadas

### 2.1 `GET /api/integrations/whatsapp/conversations` — N+1 real corrigido

**Arquivo:** `src/features/integrations/whatsapp/whatsappMessage.service.ts` (`listConversations`)

**Evidência do problema (antes):**

```ts
const groups = await prisma.whatsAppMessage.groupBy({
    by: ['phoneE164'], where: { organizationId }, _max: { receivedAt: true },
}); // 1 query — busca TODOS os números já conversados, sem limite

const mostRecentFirst = groups.filter(...).sort(...).slice(0, limit); // corte em memória, depois da query

return Promise.all(mostRecentFirst.map(async (group) => {
    const last = await prisma.whatsAppMessage.findFirst({ // 1 query POR NÚMERO
        where: { organizationId, phoneE164: group.phoneE164, receivedAt: group._max.receivedAt },
        include: { contact: { select: { id: true, name: true } } },
        orderBy: { id: 'desc' },
    });
    return { ... };
}));
```

Com o `limit` padrão de 50, isso é **1 `groupBy` + até 50 `findFirst`** = até 51 queries lógicas por
chamada da rota (cada uma sua própria transação com `SET LOCAL` de RLS — ver seção de contexto acima
— então até ~102 statements SQL reais no pior caso). O comentário original já reconhecia isso como
"N+1 tipado e seguro" aceito, argumentando que `groupBy` não suporta `include` — mas existe uma saída
nativa do Prisma para exatamente este caso.

**Correção:** `findMany` com `distinct: ['phoneE164']` (gera `DISTINCT ON` no Postgres) traz, numa
**única query**, uma linha por número já com `include: { contact }`, desde que o campo do `distinct`
venha primeiro em `orderBy` (regra do Prisma para produzir `DISTINCT ON` determinístico):

```ts
const latestPerPhone = await prisma.whatsAppMessage.findMany({
    where: { organizationId },
    distinct: ['phoneE164'],
    orderBy: [{ phoneE164: 'asc' }, { receivedAt: 'desc' }, { id: 'desc' }],
    include: { contact: { select: { id: true, name: true } } },
});
return latestPerPhone.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()).slice(0, limit).map(...);
```

`receivedAt: 'desc'` reproduz a mesma semântica do `_max(receivedAt)` antigo (mantém a mensagem mais
recente por número); `id: 'desc'` reproduz o mesmo critério de desempate do `findFirst` antigo para
mensagens empatadas no mesmo `receivedAt`. `where: { organizationId }` continua explícito — mesmo
escopo de tenant de antes — e o `include: { contact }` roda dentro da mesma transação/contexto de RLS
da query principal (não muda o isolamento de tenant, só o número de queries).

**Teste (prova de eliminação do N+1):**
`src/features/integrations/whatsapp/__tests__/whatsappMessage.service.test.ts`, describe
`listConversations — sem N+1`:
- Mocka `prisma.whatsAppMessage.findMany`/`groupBy`/`findFirst` e afirma
  `findMany` chamado **exatamente 1 vez**, `groupBy` e `findFirst` **nunca chamados** — trava
  regressão futura de volta a "1 query, mas N+1 escondido em outro método".
- Segundo teste confirma que o corte pelo `limit` continua correto (mais recentes primeiro) mesmo
  vindo de uma única query já ordenada.
- Rodado: `npx vitest run -c vitest.unit.config.ts
  src/features/integrations/whatsapp/__tests__/whatsappMessage.service.test.ts` → 11 testes, 0
  falhas (inclui os 2 novos + os 9 já existentes do arquivo, intactos).

### 2.2 `GET /api/commercial-intelligence/overview` — loop sequencial de metas corrigido

**Arquivo:** `src/features/commercial-intelligence/application/queries/executiveOverviewReport.ts`
(`buildExecutiveOverview`), `src/features/commercial-intelligence/infra/PrismaCommercialIntelligenceRepository.ts`,
`src/features/commercial-intelligence/domain/CommercialIntelligence.ts`

Este achado é levemente diferente do padrão "clássico" (não é `findMany` de uma **lista de
registros de negócio** seguido de 1 query por linha — este endpoint devolve um objeto agregado, não
uma coleção paginada). É o mesmo padrão de fundo, porém — um loop com **outra chamada Prisma
sequencial por iteração**, que poderia ser uma única query batelada — e foi encontrado na mesma
varredura, no relatório mais lido do módulo (`/overview`, base do dashboard executivo), então foi
corrigido nesta rodada por ser de baixo risco.

**Evidência do problema (antes):**

```ts
const goal = await repository.getGoal(organizationId, filter.month, 'NEW_MRR'); // query 1

const coverageProtection: CoverageProtectionEntry[] = [];
for (let i = 0; i <= 3; i++) {
    const period = shiftMonth(filter.month, i);
    const periodGoal = i === 0 ? goal : await repository.getGoal(organizationId, period, 'NEW_MRR'); // queries 2, 3, 4
    ...
}
```

4 chamadas ao repositório para buscar a meta de 4 meses (mês do filtro + Proteção 90 dias, seção 11),
3 delas dentro de um loop `for` sequencial (`await` a cada iteração, não paralelo). Cada
`getGoal` é um `findUnique` na chave composta `organizationId_period_metric`.

**Correção:** novo método `getGoals(organizationId, periods, metric)` no
`CommercialIntelligenceRepository`, implementado com um único `findMany` usando `period: { in: [...] }`
(a chave `organizationId_period_metric` é composta, então o batch precisa de `in` em vez de reusar a
unique direto — mas `organizationId` continua explícito no `where`, mesmo isolamento de tenant de
`getGoal`):

```ts
async getGoals(organizationId: string, periods: string[], metric: GoalMetric): Promise<Map<string, CommercialGoalDTO>> {
    if (periods.length === 0) return new Map();
    const goals = await prisma.commercialGoal.findMany({
        where: { organizationId, metric, period: { in: periods } },
    });
    return new Map(goals.map((goal) => [goal.period, { ... }]));
}
```

`buildExecutiveOverview` agora calcula os 4 períodos de uma vez, chama `getGoals` **uma única vez** e
usa o `Map` retornado tanto para `goal` (mês do filtro) quanto dentro do loop (que virou 100% síncrono
— sem `await` nenhum):

```ts
const protectionPeriods = [0, 1, 2, 3].map((i) => shiftMonth(filter.month, i));
const goalsByPeriod = await repository.getGoals(organizationId, protectionPeriods, 'NEW_MRR');
const goal = goalsByPeriod.get(filter.month) ?? null;
// ...
for (let i = 0; i <= 3; i++) {
    const period = protectionPeriods[i];
    const periodGoal = goalsByPeriod.get(period) ?? null;
    ...
}
```

4 queries de meta por chamada → **1 query** por chamada.

**RLS:** `CommercialGoal` tem `FORCE ROW LEVEL SECURITY` + `tenant_isolation_policy` (migration
`20260810120000_commercial_intelligence_goals_and_stage_history`) e está na lista `tenantModels` de
`src/lib/prisma.ts`. `getGoals` mantém `organizationId` explícito no `where` — mesma dupla proteção
(RLS de banco + filtro explícito) de `getGoal`.

**Teste (prova de eliminação do N+1):**
`src/features/commercial-intelligence/__tests__/CommercialIntelligenceUseCases.unit.test.ts`:
- `FakeRepository` (test double já existente, usado por toda a suíte de Comercial Inteligente) ganhou
  `getGoalCallCount`/`getGoalsCallCount` para medir **quantas vezes cada método é chamado**, não só o
  resultado.
- Novo teste "Proteção 90 dias: busca as metas dos 4 meses numa única chamada ao repositório (sem
  N+1)": popula metas em 4 meses diferentes, chama `executiveOverview`, e afirma
  `getGoalsCallCount === 1` e `getGoalCallCount === 0` — trava regressão de volta a 1+N chamadas. Além
  disso confirma que o resultado (as 4 metas corretas em `coverageProtection` e em `overview.goal`)
  não mudou com o batch.
- Os testes já existentes de Proteção 90 dias (3 testes, cobrindo classificação `saudavel`/`atencao`/
  `critico`/`sem_dados` e o caso de meta batida) continuam passando sem alteração — prova que o
  comportamento observável não mudou, só o número de queries.
- Rodado: `npx vitest run -c vitest.unit.config.ts
  src/features/commercial-intelligence/__tests__/CommercialIntelligenceUseCases.unit.test.ts` → todos
  os testes do arquivo passando (nenhuma falha).

---

## 3. Pendências (encontradas, não corrigidas nesta rodada)

### 3.1 `leadingIndicatorsReport.ts` — 12 queries de contagem em vez de 1 agregada

**Arquivo:** `src/features/commercial-intelligence/application/queries/leadingIndicatorsReport.ts`
(`buildLeadingIndicators`, endpoint `GET /api/commercial-intelligence/leading-indicators`)

`buildPoint(label, fn)` chama `fn` 6 vezes (semana atual, semana anterior, e 4 semanas da média
móvel) para cada um dos 6 indicadores. Dois desses indicadores (`countMeetings` →
`repository.countCompletedMeetings`, `countQualified` → `repository.countTimelineEventsByType`) são
`prisma.activity.count()`/`prisma.timelineEvent.count()` reais — os outros 4 filtram em memória
sobre `deals`/`history` já carregados antes do loop. Resultado: **12 queries de `count()`** (2
indicadores × 6 janelas de tempo) em vez de uma única consulta agregada por semana (ex.: um
`groupBy` bucketizado, ou uma janela de datas + agregação em SQL).

**Por que não corrigi nesta rodada:** diferente dos dois casos acima, isto não é um `findMany`
seguido de loop por item de uma lista — é um número **fixo** de 12 chamadas (não escala com volume de
dados), cada uma um `count()` simples e já indexado (`organizationId` + campos de data). O risco de
regressão é maior que nos dois casos corrigidos: a lógica de tendência/delta/`weeklySeries` deste
relatório tem testes próprios que dependem do valor exato de cada bucket semanal, e trocar por uma
única query agregada exigiria bucketizar por semana dentro do SQL (ou trazer os registros crus e
bucketizar em memória, mudando a estratégia de query de `count()` para `findMany` + agregação
client-side) — mudança de escopo maior que uma correção pontual de N+1, melhor candidata a um item
dedicado com seu próprio plano de teste antes/depois.

### 3.2 Sync sequencial do Bitrix — já documentado, não é N+1 de rota HTTP própria

`src/features/integrations/bitrix/service/{leads,deals,syncRules}.ts` continuam com o padrão de loop
+ chamada sequencial já encontrado pela varredura heurística anterior (`PERFORMANCE_BUDGETS.md` seção
4). Confirmado nesta rodada que o padrão é sincronização **contra a API externa do Bitrix24**
(rate-limited, precisa ser sequencial por natureza), não N+1 de uma rota de listagem do próprio
produto — já auditado separadamente em `BITRIX24-LEAD-FLOW-AUDIT.md`. Mantido fora do escopo desta
auditoria (que é especificamente sobre rotas `GET` de listagem do CRM), conforme o próprio
`PERFORMANCE_BUDGETS.md` já registrava.

### 3.3 Observação relacionada (não é N+1, mas é custo evitável na mesma vizinhança)

`PrismaCrm360Repository.ensureDefaultPipelines` (chamado no início de `getOverviewData`,
`getPipelines` e `getBoardLeads` — ou seja, em TODA chamada a essas 3 rotas de listagem, não só na
primeira vez) faz `upsert` de 2 pipelines e depois `attachLegacyRecords`, que roda um `updateMany` por
etapa de pipeline (6 a 13 etapas fixas, dependendo do funil). Isso não é N+1 no sentido do escopo
desta auditoria (o loop é sobre um conjunto fixo e pequeno de etapas de configuração, não sobre a
lista de registros retornada pela rota, e usa `updateMany` — não uma query por registro de negócio) —
mas é uma dezena de round-trips de escrita desnecessários toda vez que alguém abre o board/pipelines/
overview do CRM360, mesmo quando não há nenhum lead legado para migrar. Registrado aqui como
observação para um possível item futuro (ex.: só rodar `attachLegacyRecords` quando o pipeline acabou
de ser criado, não a cada leitura), não corrigido nesta rodada por estar fora do escopo estrito do
pedido (N+1 em rotas de listagem) e por tocar a lógica de bootstrap de pipelines, que tem
implicações maiores que uma correção pontual de query.

---

## 4. Validação executada

- `npx tsc --noEmit` → **sem erros**.
- `npm run lint` → **0 erros** (154 warnings pré-existentes, nenhum novo introduzido pelos arquivos
  alterados nesta rodada — `jsx-a11y`/`no-explicit-any` em arquivos não tocados por esta auditoria).
- `npm run test:architecture` (`lint:architecture` + `check:hotspots`) → **sem violações novas**
  (805 módulos, 2771 dependências cruzadas, 0 violações; hotspots: 6 arquivos já em aviso
  não-bloqueante antes desta rodada, nenhum novo cruzando o limite de falha de 1000 linhas —
  `CommercialIntelligence.ts` foi de ~782 para 789 linhas com a assinatura nova de `getGoals`,
  continua abaixo do limite de falha).
- `npx vitest run -c vitest.unit.config.ts src/features/integrations/whatsapp/__tests__/whatsappMessage.service.test.ts src/features/commercial-intelligence/__tests__/CommercialIntelligenceUseCases.unit.test.ts`
  → **72 testes, 0 falhas** (inclui os 3 testes novos desta rodada).
- `npm run test:unit` (suíte completa) → **271 arquivos de teste, 2085 testes, 0 falhas** (rodada
  completa, ~20 minutos por causa da contenção de CPU do ambiente compartilhado — erros/warnings que
  aparecem no log da suíte, ex.: "Dataset malformado", "Orçamento mensal de IA excedido (teste)",
  "Tenant ID missing", são saída esperada de testes que exercitam caminhos de erro de propósito, não
  falhas).

## 5. Arquivos alterados

- `src/features/integrations/whatsapp/whatsappMessage.service.ts` — `listConversations` reescrita.
- `src/features/integrations/whatsapp/__tests__/whatsappMessage.service.test.ts` — mocks de
  `findMany`/`groupBy`/`findFirst` + 2 testes novos.
- `src/features/commercial-intelligence/domain/CommercialIntelligence.ts` — novo método
  `getGoals` na interface `CommercialIntelligenceRepository`.
- `src/features/commercial-intelligence/infra/PrismaCommercialIntelligenceRepository.ts` —
  implementação de `getGoals` (batch via `findMany` + `in`).
- `src/features/commercial-intelligence/application/queries/executiveOverviewReport.ts` — loop de
  Proteção 90 dias trocado de sequencial-com-await para leitura de `Map` pré-carregado.
- `src/features/commercial-intelligence/__tests__/CommercialIntelligenceUseCases.unit.test.ts` —
  `FakeRepository.getGoals` + contadores de chamada + 1 teste novo.
