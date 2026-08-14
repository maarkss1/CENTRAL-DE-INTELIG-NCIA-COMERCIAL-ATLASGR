# Onda 4 — Extensões (Infraestrutura e Marca)

- Data: 2026-08-14
- Branch de integração: `integracao/onda-4`, criada a partir de `main` (commit `46e86724`)
- Executor: Coordenador (00), via Agent tool com isolamento de worktree

## Contexto

Verificação de estado real (código, não só documentação — o histórico deste repositório acumulou
três numerações de "onda" sobrepostas ao longo do tempo) confirmou que as Ondas 1, 2, 2.5 e 3 já
estavam concluídas e mescladas em `main`. Da Onda 4 (`EXECUCAO-ONDAS.md`), o Agente 09 (Mobile) já
tinha rodado em ciclo anterior; os Agentes 10 (Infraestrutura/SRE) e 11 (Marca Institucional) nunca
haviam sido executados — 11 não tinha nenhum branch/commit prévio.

## Especialistas executados

Dois especialistas em paralelo (dentro do limite de concorrência), cada um em worktree isolado a
partir de `integracao/onda-4`:

| Agente | Branch | Resultado |
|---|---|---|
| 10 — Infraestrutura, Observabilidade e SRE | `agente/10-infraestrutura-sre` | 4 commits, mesclado sem conflito |
| 11 — Marca e Ativos Institucionais | `worktree-agent-a6ce208a664e182f9` (branch nomeada pelo harness) | 3 commits, mesclado sem conflito |

Ambas as branches foram revisadas (`git diff main...<branch> --stat`) antes do merge: nenhum arquivo
fora da propriedade exclusiva de cada agente foi tocado.

## Achados e correções por agente

### Agente 10 — Infraestrutura, Observabilidade e SRE
- Corrigido bug real: `charts/prospector-atlas/templates/hpa.yaml` apontava para `kind: Deployment`
  mesmo com `blueGreen.enabled: true` (que cria um `Rollout`) — o HPA nunca escalava nada.
- Adicionado `migration-job.yaml` (Helm hook `pre-install,pre-upgrade`) em `charts/` e `k8s/`, não
  existia antes.
- Adicionado `PodDisruptionBudget`, `worker-hpa.yaml` (desligado por padrão), `alert.rules.yml` (5
  cenários: falha de migração, fila travada, sync Bitrix falhando, 5xx acima de limiar, orçamento de
  IA), `RUNBOOK.md`, `k8s/README.md`.
- Confirmado: `argocd/**` e `docker/postgres/**` já estavam corretos, sem alteração.
- `helm lint`/`kubeval`/`kubeconform` indisponíveis no ambiente local (sem cluster real acessível) —
  registrado explicitamente, validação alternativa aplicada (parser YAML real sobre manifests puros +
  revisão manual linha a linha de sintaxe Go template nos charts Helm, que não são YAML puro).
- Handoffs criados: 2 para 08 (CLI do prisma removida da imagem de produção quebra o Job de
  migração que ele criou; lint quebrado — ver abaixo), 1 para 02 (tsc quebrado por `crm360`), 1 para
  01, 1 para 06, 1 para 07 (métricas ausentes para os alertas que ele definiu).
- Nenhum segredo encontrado versionado em `k8s/**`/`argocd/**`/`charts/**`/`infrastructure/**`.

### Agente 11 — Marca e Ativos Institucionais
- Confirmado: cores documentadas em `identidade-visual/**` batem exatamente com os tokens usados em
  código (`globals.css`, `BrandContext.tsx`) — nenhuma divergência, nenhum handoff de cor necessário.
- Removido `public/totaltrack-logo.png` (logo TotalTrac legado, confirmado sem nenhuma referência no
  código antes da remoção).
- Atualizados `documentacao-aplicacao/inventario/mapa-de-navegacao.md` e a seção 3 de
  `briefing-completo.md`, que estavam desatualizados frente à Sidebar real (faltavam Cockpit CRM,
  Comercial Inteligente, Market Intelligence, Matriz de Qualificação/Objeções, Win/Loss,
  Integrações, Configurações, Equipe, Extrator Bitrix24).
- Nenhum conteúdo sensível encontrado em amostragem de `documentacao-aplicacao/imagens/**`.
- Fechou, como destinatário, o handoff stale `onda-3/07-para-11-lgpd-service-fix.md` (endereçado ao
  agente errado por engano — já resolvido em código antes desta sessão, sem atribuição registrada).
- Handoffs criados: 1 bloqueador para 02 (rota do `crm360` ausente — ver abaixo, já resolvido pelo
  Coordenador), 1 para o Coordenador (dois vídeos institucionais byte-a-byte idênticos com roteiros
  diferentes — decisão de negócio, não corrigido).

## Achado e correção do Coordenador durante a integração (fora do escopo dos dois agentes)

Ambos os agentes, de forma independente, encontraram o gate de `main` quebrado antes mesmo de
começar seu próprio trabalho:
1. `npx tsc --noEmit` falhava: `TAB_ROUTE_SET` em `src/lib/navigationBus.ts` não incluía a chave
   `crm360` (tab introduzida pelo commit `3f6e336e feat(02)`, já em `main`).
2. `npm run lint` quebrava antes de analisar qualquer arquivo: `eslint.config.mjs` referenciava 4
   regras do React Compiler (`react-hooks/set-state-in-effect`, `purity`, `immutability`,
   `use-memo`) que só existem em `eslint-plugin-react-hooks` >=6 — o projeto está fixado em v5.2.0
   desde o revert registrado em `dabb7fb`, que não removeu essas linhas.
3. O item de menu "Cockpit CRM" (`crm360`) nunca teve `<Route>` registrada em `App.tsx` — clique no
   menu caía no wildcard e voltava silenciosamente ao Dashboard (mesmo padrão do bloqueador #7 de
   `/AGENTS.md`, "navegação que não navega").

Os itens 1 e 2 bloqueavam o gate obrigatório de qualquer onda, não só da Onda 4. O item 3 é uma
regressão de produto real e silenciosa. Todos os três eram pequenos, mecânicos, sem ambiguidade de
design, e corrigidos diretamente pelo Coordenador (commits `7040c003` e `241afea0`, antes da
integração dos dois agentes) em vez de devolvidos como bloqueador para um ciclo de remediação futuro
— nenhuma alteração de escopo/arquitetura, apenas registrar o que já existia corretamente em outros
pontos do código (`Sidebar.tsx`, `tabMeta.ts`, `CrmOverview.tsx` já esperavam essa rota).

## Testes (rodados na branch de integração, após merge das duas branches)

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ PASSOU — 0 erros |
| `npm run lint` | ✅ PASSOU — 0 erros, 101 warnings (mesmo débito pré-existente `jsx-a11y/*`/`@typescript-eslint/no-explicit-any`, nenhum warning novo) |
| `npm run build` | ✅ PASSOU |

`npm run test:unit`/`test:integration`/`test:e2e` não fazem parte do gate oficial da Onda 4
(`EXECUCAO-ONDAS.md` define apenas tsc/lint/build para esta onda, mais validação de infraestrutura
específica) — nenhum arquivo `.ts`/`.tsx` de aplicação foi alterado pelos dois especialistas, só o
Coordenador tocou `src/App.tsx`/`navigationBus.ts`/`eslint.config.mjs`; recomendo ao usuário rodar a
suíte completa antes do release, não só o gate desta onda.

Varredura manual de segredo sobre o diff acumulado (`git diff main...integracao/onda-4` restrito a
`k8s/argocd/charts/infrastructure/docker/identidade-visual/documentacao-aplicacao/public`) — nenhum
achado.

## Handoffs (abertos e resolvidos nesta onda)
- Resolvido nesta onda: `onda-3/07-para-11-lgpd-service-fix.md` (stale, endereçado errado).
- Resolvido nesta onda: `onda-4/11-para-02-crm360-rota-ausente.md` (bloqueador, corrigido
  diretamente pelo Coordenador — ver seção acima).
- Abertos, não bloqueadores, para a próxima rodada de trabalho: `10-para-01-metricas-http-otel.md`,
  `10-para-02-tsc-quebrado-tab-route-set-crm360.md` (achado técnico já resolvido pela correção
  acima; handoff em si documenta o diagnóstico, mantido como registro histórico — não reabre
  bloqueio), `10-para-06-metricas-sync-bitrix.md`, `10-para-07-metricas-fila-orcamento-ia.md`,
  `10-para-08-lint-quebrado-eslint-config.md` (achado técnico já resolvido pela correção acima, mesmo
  caso), `10-para-08-prisma-cli-imagem-producao.md`, `11-para-00-videos-institucionais-duplicados.md`
  (decisão de negócio).
- Nenhum handoff `Prioridade: bloqueador` permanece `Status: aberto`.

## Riscos restantes
- `k8s/`/`argocd/`/`charts/` continuam sendo caminho de deploy não-ativo (Render+Vercel é o real);
  o trabalho desta onda os deixa consistentes e documentados, não os torna o caminho de produção.
- Nenhuma validação real de cluster (`helm lint`/`kubeval`/rollback simulado) foi possível neste
  ambiente — recomenda-se rodar antes de qualquer adoção real desses manifests.
- `crm360`/`CrmOverview` não foi validado visualmente em navegador (exige Postgres/Redis locais e
  login autenticado, não provisionados nesta sessão) — recomendo validação manual antes do release.
- Imagem de produção do `Dockerfile` remove a CLI do prisma (`npm prune --omit=dev`), o que
  invalidaria o Job de migração do Agente 10 em um cluster real — handoff aberto para 08, não
  corrigido nesta onda (fora da propriedade do Coordenador sem aprovação explícita para tocar
  `Dockerfile`).
- Dois vídeos institucionais idênticos com roteiros diferentes — decisão de negócio pendente.

## Decisão da Onda 4
**APROVADA na branch de integração.** Todos os gates obrigatórios da onda passaram. Nenhum handoff
bloqueador ficou aberto. Nenhum segredo exposto, nenhum dado fictício, nenhuma alteração fora de
propriedade.

**Ainda não mesclada em `main`** — aguardando revisão e aprovação explícita do usuário antes do
merge final, conforme solicitado.
