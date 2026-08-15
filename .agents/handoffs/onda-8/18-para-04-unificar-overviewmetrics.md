- De: 18
- Para: 04
- Onda: 8
- Status: aberto
- Prioridade: normal

## Problema
`OverviewMetrics` (resumo agregado de KPIs do CRM: totais de empresas/contatos/leads/atividades,
funil, `pipelineValue`) está declarado de forma independente em dois arquivos do seu domínio, com
campos idênticos hoje mas sem nenhuma relação de import entre si:
- `src/features/analytics/domain/Analytics.ts:26-46` (camada de domínio, versão "wired", usada por
  `AnalyticsUseCases`);
- `src/features/analytics/analytics.service.ts:31-50` (serviço legado, ainda consumido de verdade
  por `src/features/crm/jobs/weeklyPdfReport.worker.ts` — não é código morto).

Isso não é um bug ativo (os campos batem hoje), mas é dívida agendada: nada impede as duas
declarações de divergir silenciosamente no futuro (um campo renomeado ou removido em uma sem a
outra), e o typecheck não acusaria — cada arquivo tem seu próprio tipo local.

## Arquivo(s) envolvido(s)
- `src/features/analytics/domain/Analytics.ts` (linhas 26-46)
- `src/features/analytics/analytics.service.ts` (linhas 31-50)
- `src/shared/contracts/analytics.contract.ts` (**novo**, criado nesta onda pelo Agente 18 — fonte
  canônica proposta, campos idênticos aos dois arquivos acima)
- Consumidor indireto: `src/features/crm/jobs/weeklyPdfReport.worker.ts` (usa `analytics.service.ts`)

## Alteração necessária
1. Em `src/features/analytics/domain/Analytics.ts`, substituir a declaração local de
   `OverviewMetrics` por `export type { OverviewMetrics } from '../../../shared/contracts/
   analytics.contract.js';` (ajuste o caminho relativo real) — ou `import type` + re-export,
   conforme o padrão que vocês preferirem para manter `AnalyticsDashboard.overview: OverviewMetrics`
   funcionando sem mudança de assinatura pública.
2. Em `src/features/analytics/analytics.service.ts`, mesma substituição.
3. Confirmar que `AnalyticsUseCases.ts` (que já importa de `../domain/Analytics`) continua
   compilando sem alteração — ele não precisa saber que a origem mudou.
4. Rodar `npx tsc --noEmit` para confirmar que os dois arquivos permanecem estruturalmente
   compatíveis com `src/shared/contracts/analytics.contract.ts` (é o próprio TypeScript que vai
   flagar qualquer campo que hoje divergisse e eu não tenha visto).

## Teste esperado
- `npx tsc --noEmit` sem erros novos.
- `npm run test:unit` — specs existentes de `tests/unit/features/analytics/**` continuam passando
  sem alteração de asserção (o contrato não muda, só a origem do tipo).
- Nenhuma mudança de comportamento em runtime — é refatoração de tipo, não de lógica.

## Contexto adicional
Este handoff é o item 2 da missão do Agente 18 (`.agents/prompts/18-contratos-api-docs.md`) —
"OverviewMetrics: uma fonte, não duas" — já registrado como débito conhecido em
`PLATFORM_COMPLETION_REPORT.md` e `.agents/completion/02-mapa-plataforma.md` §7.4.

Par deste handoff no lado frontend: `.agents/handoffs/onda-8/
18-para-02-unificar-overviewmetrics-frontend.md` (mesma unificação em `analytics.api.ts`) — os dois
podem ser aplicados independentemente, mas o contrato canônico é o mesmo arquivo
(`src/shared/contracts/analytics.contract.ts`), então vale alinhar antes de os dois merges
acontecerem para não haver dois PRs mudando o mesmo `src/shared/**` ao mesmo tempo (regra de
`AGENTS.md` sobre `src/shared/**` exigir acordo prévio entre 02/04/18).

Durante a varredura mais ampla que este handoff motivou, encontrei uma duplicação bem maior no
mesmo padrão em `src/features/commercial-intelligence/` (18 interfaces quase idênticas entre
`domain/CommercialIntelligence.ts` e `commercialIntelligence.api.ts`) — reportado separadamente em
`.agents/handoffs/onda-8/18-para-04-duplicacao-commercial-intelligence-contract.md` para não
misturar os dois escopos neste handoff.
