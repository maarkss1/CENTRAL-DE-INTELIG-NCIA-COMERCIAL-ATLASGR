- De: 18
- Para: 02
- Onda: 8
- Status: aberto
- Prioridade: normal

## Problema
`OverviewMetrics` está redeclarado no cliente HTTP do frontend
(`src/features/analytics/analytics.api.ts:19-31`), com campos idênticos aos dois arquivos de
backend (`src/features/analytics/domain/Analytics.ts` e `analytics.service.ts`), mas sem nenhum
import compartilhado. É a mesma dívida agendada descrita em
`.agents/handoffs/onda-8/18-para-04-unificar-overviewmetrics.md` (par backend deste handoff), só
que do lado do consumo na tela.

## Arquivo(s) envolvido(s)
- `src/features/analytics/analytics.api.ts` (linhas 19-31)
- `src/shared/contracts/analytics.contract.ts` (**novo**, criado nesta onda pelo Agente 18)

## Alteração necessária
Em `src/features/analytics/analytics.api.ts`, substituir a declaração local de `OverviewMetrics`
por `import type { OverviewMetrics } from '../../shared/contracts/analytics.contract.js';` (ajuste
o caminho relativo real) e remover a interface local. Confirmar que os componentes consumidores
(dashboard, `LiveStatsWidget`, etc.) continuam compilando sem alteração — a forma pública do tipo
não muda, só a origem.

## Teste esperado
- `npx tsc --noEmit` sem erros novos.
- `npm run test:unit` — specs de componentes que consomem `OverviewMetrics` via
  `analytics.api.ts` continuam passando sem alteração de asserção.
- Nenhuma mudança visual/comportamental — é refatoração de tipo.

## Contexto adicional
Coordenar com o handoff par (`18-para-04-unificar-overviewmetrics.md`) antes de mesclar, já que
`src/shared/contracts/analytics.contract.ts` é compartilhado entre os dois lados e alterações
simultâneas nele exigem acordo entre 02/04/18 (ver `/AGENTS.md` sobre `src/shared/**`).
