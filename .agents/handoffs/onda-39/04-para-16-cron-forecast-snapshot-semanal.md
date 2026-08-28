- De: 04
- Para: 16
- Onda: 39
- Status: aberto
- Prioridade: normal

## Problema

`PrismaForecastSnapshotStore` (persistência real do snapshot semanal do Forecast) já existe (ver
`.agents/handoffs/onda-39/04-para-01-schema-forecast-snapshot.md`, resolvido), mas nada chama
`ForecastSnapshotStore.save` fora de teste — não existe nenhum worker/cron que rode
`buildForecastSnapshot` + `save` periodicamente. Sem isso, a tabela `ForecastSnapshot` nunca
recebe uma linha em produção, e o pilar "Confiabilidade de Forecast" do Health Score
(`application/healthScore.ts`) continua "não disponível" mesmo com a persistência pronta.

## Arquivo(s) envolvido(s)

- `worker.ts` (propriedade exclusiva do Agente 01/16 — registro de workers/schedulers, ver
  `/AGENTS.md` → "Propriedade exclusiva de arquivos").
- Novo arquivo sugerido: `src/features/commercial-intelligence/jobs/forecastSnapshot.worker.ts`,
  mesmo padrão de `src/features/crm/jobs/weeklyPdfReport.worker.ts` (`createXWorker`/
  `scheduleXJob`, BullMQ).
- Já prontos, só precisam ser chamados a partir do worker novo:
  - `src/features/commercial-intelligence/application/forecastSnapshot.ts` — `buildForecastSnapshot`.
  - `src/features/commercial-intelligence/infra/PrismaForecastSnapshotStore.ts` — `.save(...)`.
  - Fonte do `ExecutiveOverview` de cada organização: mesmo cálculo já usado pelas rotas de
    Comercial Inteligente (ver `src/features/commercial-intelligence/application/executiveOverview.ts`
    ou equivalente — o worker precisa iterar as organizações ativas, uma chamada de save por
    organização, mesmo período corrente).

## Alteração necessária

Um worker/scheduler semanal (ex.: toda segunda-feira de manhã) que, para cada organização ativa:
1. Calcula o `ExecutiveOverview` do período corrente.
2. Monta o registro com `buildForecastSnapshot(organizationId, overview, now)`.
3. Persiste com `new PrismaForecastSnapshotStore().save(record)`.

Registrar `createForecastSnapshotWorker`/`scheduleForecastSnapshotJob` em `worker.ts`, mesmo padrão
das linhas 34-50/88-95 já existentes (ver `scheduleWeeklyPdfReportJob` como referência mais
próxima — também semanal, também itera organizações).

## Teste esperado

Unitário: dado um conjunto de organizações mockado, o job chama `save` uma vez por organização,
com o `ExecutiveOverview` correto do período corrente — mesmo padrão de teste já usado pelos outros
workers semanais deste arquivo (mock de BullMQ + mock dos serviços de cálculo).

## Contexto adicional

Não é bloqueador do handoff de schema (já resolvido) — é uma frente independente sobre "quem
dispara", não sobre "onde persiste". Enquanto este handoff não é resolvido, `ForecastSnapshot`
existe como tabela mas fica vazia em produção.
