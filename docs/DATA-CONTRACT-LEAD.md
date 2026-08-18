# Contrato de dados canônico — Lead

Sprint 05 / Onda 17 (DATA-001). Matriz campo a campo do modelo `Lead`:
`Prisma | Domain | Repository | DTO/API | UI | Bitrix | Analytics`.

Este documento é o registro formal da auditoria feita nesta sprint (5 investigações paralelas e
independentes, cada uma lendo o código-fonte real, não a documentação anterior). Ele descreve o
estado real do contrato — inclusive as divergências não corrigidas nesta rodada, listadas
explicitamente como pendência em vez de omitidas. Ver `.agents/runs/onda-17.md` para o que foi
corrigido nesta sprint e o racional de cada decisão de escopo.

## Como ler esta matriz

- **Prisma**: tipo/nullable/enum em `prisma/schema.prisma` (model `Lead`).
- **Domain**: tipo em `src/features/crm/domain/Lead.ts`.
- **Repository**: se `PrismaLeadRepository` (`src/features/crm/infra/PrismaLeadRepository.ts`) lê
  e escreve o campo no caminho padrão da aplicação.
- **DTO/API**: se `leadSchema` (`src/lib/zod.ts`) valida o campo, e se `docs/openapi.yaml`
  documenta.
- **UI**: se algum componente de `src/features/crm/components/` exibe/edita o campo.
- **Bitrix**: mapeamento em `src/features/integrations/bitrix/bitrixFieldMap.ts` e direção real
  (import/export) confirmada em `service/leads.ts`, `service/deals.ts`, `service/customFields.ts`.
- **Analytics**: se o campo entra em algum cálculo de `commercial-intelligence`/`analytics`.

## Matriz

| Campo | Prisma | Domain | Repository (leadSchema/API padrão) | UI | Bitrix | Analytics | Observação |
|---|---|---|---|---|---|---|---|
| `status` | `enum LeadStatus` (18 valores, `@map` para rótulo legível) | `LeadStatus` (Prisma) | lido/escrito | Kanban (6+12 colunas), drawer | mapeado só como texto (`bitrixStageLabel`); **enum interno nunca reflete `STATUS_ID`/`STAGE_ID` real no import** (sempre grava `Lead_Recebido`) | usado em quase todo cálculo | Pendência: mapear `STATUS_ID`/`STAGE_ID` → `LeadStatus` no import exige decisão de produto (mapa por portal Bitrix) — não corrigido nesta sprint |
| `funnel` | `enum LeadFunnel { Lead, Negocio }` | idem | lido/escrito (`findAllWithFilters`, `create`/`update` via spread) | toggle Leads/Negócios no board | **Corrigido nesta sprint**: `deals.ts` agora seta `Negocio` explicitamente no import (antes ficava no default `Lead`) | filtra `PrismaCommercialIntelligenceRepository`/`crm360` | Comentário do schema que dizia "não lido/escrito pelo repositório" estava desatualizado para este campo especificamente — corrigido |
| `resumeDate` | `DateTime?` | idem | **não** (fora de `leadSchema`) | não exibido | bidirecional, sem timezone explícita (`toISOString().slice(0,10)`) | não usado | Pendência: sem UI; risco de deslocamento de 1 dia se o portal Bitrix não estiver em UTC-03:00 |
| `cadenceStage` | `String?` | idem | não | não exibido | bidirecional; falha de tradução de enum é **omitida silenciosamente** na saída | não usado | Pendência de produto (UI) |
| `lossReason` | `String?` | idem | não (Mesa de Tratamento grava sem Zod) | Mesa de Tratamento (não CRM board) | bidirecional; **contrato de valor ambíguo** — Mesa de Tratamento grava ID Bitrix cru, sync grava texto resolvido | usado em `lossTaxonomy.ts` | Pendência: precisa normalizar sempre para texto antes de gravar |
| `dealPackage` | `String?` | idem | não | não exibido | **só via `crm.deal.*`** (`leadCode: null`) | não usado | Pendência de produto |
| `dealStatus` | `String?` | idem | não | não exibido | mapeado (deal-only) | não usado | Pendência de produto |
| `relationshipLevel` | `String?` | idem | não | não exibido | deal-only | não usado | Pendência de produto |
| `commissionPercent` | `String?` (dropdown discreto, não numérico) | idem | não | não exibido | deal-only, `enumeration` | não usado | Tipo `String` é intencional (Bitrix modela como dropdown, não numérico) |
| `partnerBroker` | `String?` | idem | não | não exibido | mapeado | não usado | Pendência de produto |
| `qualificationValidatedByAM` | `Boolean?` | idem | não | não exibido | **falha de tradução vira `false` persistido** (diferente do padrão dos outros enums, que preservam o ID bruto) | não usado | Pendência: corrigir para preservar estado desconhecido em vez de `false` fabricado |
| `owner` | `String?`, sem FK para `User` | idem | lido/escrito | Kanban card + drawer | resolve e-mail→`User.id` só na entrada; sem resolução automática na saída | Pipeline/Data Readiness Score | **Corrigido nesta sprint**: `LeadDetailDrawer.tsx` gravava o *nome* em vez do `User.id` a cada reatribuição manual — bug ativo, reintroduzia o que a Onda 10 já tinha corrigido no import Bitrix. Pendência: card do Kanban ainda exibe o valor cru (pode ser um `id` ilegível) — não resolvido para nome de exibição nesta rodada |
| `source` | `String?` | idem | lido/escrito | não exibido | mapeado, mas **descartado em todo import** (a tag fixa `"Bitrix24 (importado)"` tem prioridade) | usado em export CSV | Comportamento intencional documentado no próprio código |
| `score` | `Int?` | idem | lido/escrito | Kanban card (`lead.score &&` — `score: 0` some do card) | sem campo Bitrix mapeado | não usado diretamente | — |
| `amount` | `Float?` | idem | lido/escrito, validado no Zod | não exibido no board | **buscado (`OPPORTUNITY`) e descartado antes de persistir** no import de Deal | soma em quase toda métrica de pipeline/forecast | Pendência: import de Deal não grava valor de negócio nenhum |
| `currency` | `String @default("BRL")` | não presente em `DealRow` (commercial-intelligence) | lido/escrito | não exibido | não mapeado | **somas cross-currency sem conversão** — risco latente, hoje sem impacto porque não há UI editando `currency` | Pendência: documentado, não corrigido (sem UI editando o campo hoje, risco não se manifesta ainda) |
| `closedAt` | `DateTime?` | idem | lido/escrito | não exibido | sem campo Bitrix mapeado (nem `CLOSEDATE` é requisitado) | usado em quase toda métrica de fechamento; corretamente resetado a `null` na reabertura | **Corrigido nesta sprint**: 3 implementações divergentes do que fecha o lead (`update()`, `updateStatus()`, `PrismaCrm360Repository.updateLeadStage()`) unificadas em `isLeadClosingStatus`/`LEAD_CLOSING_STATUSES` (`src/lib/enumMap.ts`) |
| `expectedCloseAt` | `DateTime?` | idem | lido/escrito, **dois schemas Zod divergentes** (`leadSchema`: string livre; `crmDealSchema`: `datetime()` estrito, e este último não está conectado a nenhuma rota) | não exibido | não mapeado | não usado | Pendência: alinhar validação |
| `probability` | `Int?` | idem | não em `leadSchema` (só `crmDealSchema`, morto) | não exibido | não mapeado | usado (`forecastEngine.ts`) | — |

## Vocabulário de status/funil — confirmação de consistência

Auditoria confirmou que os **18 rótulos** de `LeadStatus` são idênticos, byte a byte, em:
`schema.prisma` (`@map`), `src/lib/zod.ts` (`LEAD_STATUS`), `src/lib/enumMap.ts`
(`LEAD_STATUS_TO_PRISMA`), `KanbanColumn`/`LeadDetailDrawer` (via `LEAD_STATUS_EMOJI`
consolidado nesta sprint), `PrismaCrm360Repository.ts` (`LEAD_STAGES`/`DEAL_STAGES`), e
`CrmBoard.tsx` (`LEAD_COLUMNS`/`DEAL_COLUMNS`). Não há alias/tradução divergente.

Removido nesta sprint (código morto, nunca importado, risco de confusão por colidir de nome):
`LEAD_FUNNEL_STATUS`, `DEAL_FUNNEL_STATUS`, `LEAD_FUNNEL = ['LEADS','DEALS']` (todos em
`src/lib/zod.ts`).

Removido nesta sprint (arquivo morto completo): `src/features/crm360/services/crm360.service.ts`
— um segundo conjunto de `LEAD_STAGES`/`DEAL_STAGES` mantido manualmente em paralelo à
implementação real (`PrismaCrm360Repository.ts`, registrada via DI), sem nenhum import de fora de
si mesma na aplicação (só citada em comentários, e importada por um teste como atalho de setup,
já corrigido para usar a implementação real).

## Fechamento (`closedAt`) — fonte única

`src/lib/enumMap.ts` → `LEAD_CLOSING_STATUSES` / `isLeadClosingStatus()`: `'Negócios Ganhos'`,
`'Negócios Perdidos'`, `'Piloto Atlas Profile - Cancelado'`, `'Piloto Logístico - Cancelado'`.
União dos 3 conjuntos que existiam antes desta sprint — nenhum comportamento existente foi
revertido, só os dois caminhos mais estreitos passaram a tratar os 2 estágios "Cancelado" como
fechamento, igual ao terceiro já fazia.

Nota: `PrismaCommercialIntelligenceRepository.ts` mantém seu próprio
`FALLBACK_WON_STATUSES`/`FALLBACK_LOST_STATUSES` (usado só quando um negócio legado não tem
`pipelineStageId`) — não convertido para a fonte única nesta sprint porque separa won/lost
explicitamente e `LEAD_CLOSING_STATUSES` representa só a união "fechado". Pendência: se um quinto
lugar precisar dessa distinção, considerar estender `enumMap.ts` com `LEAD_WON_STATUSES`/
`LEAD_LOST_STATUSES` em vez de duplicar de novo.

## OpenAPI — drift confirmado, não corrigido nesta sprint

`docs/openapi.yaml` documenta só 11 dos 18 valores de `LeadStatus` (faltam os 7 "Piloto"), não
documenta `funnel`, `amount`, `closedAt`, `expectedCloseAt`, nem os 8 campos comerciais espelhados
do Bitrix. `npm run test:api-schema` (schemathesis) tem path Windows-only
(`.venv-opensource\Scripts\schemathesis.exe`) e não roda no CI. `scripts/verify-openapi-drift.ts`
existe mas só compara existência de rota (prefixo), não corpo/campo, e também não está registrado
como script `npm`/CI. **Não existe hoje nenhum contract test real cobrindo o modelo `Lead` campo a
campo.** Corrigir isso (DATA-008) é pendência para uma rodada futura — atualizar o YAML manualmente
sem um contract test automatizado teria o mesmo risco de voltar a divergir.

## Analytics — timezone e duplicação (DATA-006/007), não corrigido nesta sprint

- `monthRange()`/`currentPeriod()` (`commercial-intelligence/application/CommercialIntelligenceUseCases.ts`)
  e `startOfCurrentMonth()` (`analytics/analytics.service.ts`) usam UTC puro, nunca
  `America/Sao_Paulo` — deslocam até ~3h de negócios fechados/criados perto da meia-noite BRT para
  o dia/mês seguinte em UTC. O repositório já resolve esse exato problema em
  `src/features/integrations/bitrix/service/extractionPeriod.ts` (offset fixo `BR_OFFSET_MS`), mas
  o padrão não foi replicado nos módulos de analytics.
- `commercialIntelligence.api.ts:currentMonth()` (horário local do browser) diverge de
  `CommercialIntelligenceUseCases.ts:currentPeriod()` (UTC) — o "mês atual" default do filtro pode
  discordar entre frontend e backend nas primeiras ~3h de cada dia UTC.
- `buildForecastRange`/`computeTrendMomentum` existem duplicados linha a linha em
  `application/predictiveForecast.ts` (backend) e `commercialIntelligence.api.ts` (frontend), sem
  import compartilhado.
- Dois sistemas de analytics paralelos coexistem: `commercial-intelligence/` (com dicionário de
  métricas versionado, `metricsDictionary.ts`) e `analytics/` legado (ainda em uso real por
  `weeklyPdfReport.worker.ts`), com fórmulas de nome parecido mas semântica diferente — ex.:
  `conversionRate` = `won/total` no legado vs. `won/(won+lost)` no módulo novo.
- `analytics.service.ts:overview()`'s `conversionRate` retorna `0` fabricado (não `null`) quando
  `totalLeadsEver === 0`, contrariando o próprio comentário do arquivo ("não devolve números
  fictícios quando a base está vazia"). Não corrigido nesta sprint porque `conversionRate: number`
  é o tipo do contrato compartilhado (`src/shared/contracts/analytics.contract.ts`), consumido por
  pelo menos 6 componentes de UI com `.toFixed()` sem checagem de nulidade — mudar o tipo para
  `number | null` é uma mudança de contrato em cascata, não um fix pontual.

Estas quatro áreas ficam registradas como pendência real para uma sprint futura dedicada a
analytics — não foram tratadas aqui por exigirem mudança em cálculo de métricas já em produção
(risco que pede teste de regressão dedicado, não uma correção no meio de uma sprint ampla) ou
mudança de contrato em cascata pela UI.
