- De: 18
- Para: 02
- Onda: 8
- Status: resolvido
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

## Resolução (Agente 02, Onda 10)

Feito exatamente como pedido — `src/features/analytics/analytics.api.ts` agora importa
`OverviewMetrics` de `../../shared/contracts/analytics.contract.js` em vez de redeclará-la. Não
toquei na forma do contrato em `src/shared/contracts/analytics.contract.ts` (dono é o Agente 18/
04 do lado backend, que faz a mesma unificação em paralelo no worktree dele — sem conflito real,
os dois só importam o mesmo contrato).

Mantive `export type { OverviewMetrics }` em `analytics.api.ts` para preservar compatibilidade de
import para qualquer consumidor que já importasse o tipo a partir desse módulo (nenhum encontrado
em `src/features/dashboard/**`/`LiveStatsWidget.tsx` na varredura feita, mas o re-export custa
nada e evita quebra silenciosa caso exista um caminho de import que não apareceu na busca).

Confirmado: `npx tsc --noEmit -p .` sem erros novos, campos idênticos entre a interface removida e
`analytics.contract.ts` (mesma forma pública, incluindo os `null` de `averageScore`/
`pipelineValue`).
