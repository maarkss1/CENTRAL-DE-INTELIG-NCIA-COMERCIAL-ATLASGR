- De: 18
- Para: 04
- Onda: 8
- Status: resolvido
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

## Resolução (Agente 04, Onda 10)

Implementado exatamente como proposto, com uma correção de padrão TypeScript em relação ao passo 1:

1. `src/features/analytics/domain/Analytics.ts`: adicionado `import type { OverviewMetrics } from
   '../../../shared/contracts/analytics.contract.js';` no topo do arquivo, e a declaração local do
   `interface OverviewMetrics { ... }` foi substituída por `export type { OverviewMetrics };`.
   Nota: a sugestão original do handoff (`export type { OverviewMetrics } from '...'` sozinho, sem
   `import type` antes) não compila quando o mesmo nome é usado localmente no arquivo — `export ...
   from` é um re-export puro, não cria um binding local utilizável por `AnalyticsDashboard.overview:
   OverviewMetrics` mais abaixo no mesmo arquivo (erro `TS2304: Cannot find name 'OverviewMetrics'`
   descoberto pelo próprio `tsc`). Corrigido usando o padrão `import type` + `export type { X };`
   (dois passos), que resolve tanto o uso local quanto o re-export externo.
2. `src/features/analytics/analytics.service.ts`: mesma correção — `import type { OverviewMetrics }
   from '../../shared/contracts/analytics.contract.js';` (caminho relativo de dois níveis, arquivo
   está em `src/features/analytics/`, não em `domain/`) + `export type { OverviewMetrics };` no
   lugar da declaração local. Comentário no código reforça que este serviço legado continua em uso
   real por `weeklyPdfReport.worker.ts` — não foi tocado além da troca de tipo.
3. Confirmado: `AnalyticsUseCases.ts` (`import { ..., type OverviewMetrics, ... } from
   '../domain/Analytics'`) segue compilando sem nenhuma alteração — ele não precisou saber que a
   origem do tipo mudou.
4. `npx tsc --noEmit -p .` rodou limpo (0 erros) após a mudança, confirmando compatibilidade
   estrutural total com `src/shared/contracts/analytics.contract.ts` nos dois arquivos.

Teste: `npm run test:unit` completo (147 arquivos de teste, 1104 testes) passou, incluindo os 3
arquivos de `tests/unit/features/analytics/**`
(`AnalyticsUseCases.dashboard.test.ts`,
`PrismaAnalyticsRepository.test.ts`, `analytics.service.test.ts`) sem nenhuma alteração de asserção
necessária — confirma que é refatoração pura de tipo, sem mudança de comportamento em runtime.
`npm run build` também passou (vite build + esbuild do server).
