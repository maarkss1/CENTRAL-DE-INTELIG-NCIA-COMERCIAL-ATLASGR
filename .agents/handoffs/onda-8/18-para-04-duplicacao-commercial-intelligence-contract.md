- De: 18
- Para: 04
- Onda: 8
- Status: aberto
- Prioridade: normal

## Problema
Durante a varredura de duplicação de contrato motivada pela missão "OverviewMetrics: uma fonte,
não duas" (`.agents/prompts/18-contratos-api-docs.md`), encontrei uma instância bem maior do mesmo
padrão em Comercial Inteligente: **18 interfaces** quase 100% idênticas campo a campo, declaradas
de forma independente em backend e frontend, sem nenhuma relação de import:
- `src/features/commercial-intelligence/domain/CommercialIntelligence.ts` (linhas 1-425)
- `src/features/commercial-intelligence/commercialIntelligence.api.ts` (linhas 1-149)

Interfaces afetadas: `CommercialGoalDTO`, `CoverageSnapshot`, `ExecutiveOverview` (23 campos),
`PipelineCreationBreakdown`, `PipelineCreation`, `FunnelStageConversion`, `PerformanceMetrics`
(backend fatora `OpportunityCounts`/`AverageTicket`/`SalesCycleStats` como sub-interfaces nomeadas;
o frontend usa a mesma forma inline, anônima), `AgingBucket`, `StageAging`, `AgingReport`,
`LossReasonBreakdown`, `LossAnalysis`, `LeadingIndicatorPoint`, `LeadingIndicatorsReport`,
`AlertSeverity`, `ExecutiveAlert`, `CrmQualityField`, `BitrixSyncFailure`, `BitrixSyncHealth`,
`CrmQualityIndex`, `DealDrillDownRow`, `DealDrillDownResult`, `MetricDefinition`.

Não é bug ativo hoje (os campos batem), mas é a maior superfície de dívida agendada deste tipo no
repositório — muito maior que `OverviewMetrics`, e não estava registrada em nenhum documento antes
desta varredura.

## Arquivo(s) envolvido(s)
- `src/features/commercial-intelligence/domain/CommercialIntelligence.ts`
- `src/features/commercial-intelligence/commercialIntelligence.api.ts`

## Alteração necessária
Não apliquei a extração eu mesmo — é grande demais para tratar como parte da unificação pontual de
`OverviewMetrics`, e as 18 interfaces são lógica de domínio de BI executivo, do seu domínio.
Proposta: criar `src/shared/contracts/commercialIntelligence.contract.ts` (mesmo padrão de
`src/shared/contracts/analytics.contract.ts`, criado nesta onda) com as 18 interfaces, e trocar as
duas declarações locais por import a partir dali — mesmo tratamento dado a `OverviewMetrics` em
`.agents/handoffs/onda-8/18-para-04-unificar-overviewmetrics.md`. Se preferir dividir com o Agente
02 pelo lado do consumo no frontend, abra o par deste handoff — meu escopo em `src/shared/**` exige
acordo prévio com vocês dois (`/AGENTS.md`), então não criei o arquivo compartilhado sem essa
confirmação primeiro, diferente do que fiz com `analytics.contract.ts` (que era o item já nomeado
explicitamente na minha missão desta onda).

## Teste esperado
- `npx tsc --noEmit` sem erros novos após a extração.
- Testes existentes de `tests/unit/features/commercial-intelligence/**` (se existirem) continuam
  passando sem alteração de asserção.

## Contexto adicional
Ver também a varredura mais ampla de duplicação (não limitada a este módulo) registrada em
`.agents/handoffs/onda-8/18-para-00-varredura-duplicacao-contratos.md`, que lista outras 6
instâncias menores do mesmo padrão espalhadas por outros domínios (activities, knowledge,
notifications, automations, calendar, entidades de CRM) para que o Coordenador decida prioridade
de tratamento entre ondas.
