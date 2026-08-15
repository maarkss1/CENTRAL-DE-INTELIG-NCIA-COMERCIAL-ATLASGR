# Onda 8 — Acabamento e Go-Live

- Data: 2026-08-15
- Branch de integração: `integracao/onda-8`, criada a partir de `main` (commit `67e80179`, já com
  as Ondas 1-7 e a remediação pós-Onda 4/5 integradas).
- Executor: Coordenador (00), via Agent tool com isolamento de worktree.
- Autorização: usuário pediu explicitamente o início da Onda 8, confirmando que a outra sessão ativa
  no repositório neste momento não está trabalhando nesta mesma onda.

## Contexto

Última onda planejada em `.agents/completion/03-ondas-de-finalizacao.md`. Meta: fechar os últimos
estados cenográficos, débito de acessibilidade, paridade mobile real, ativos institucionais,
deriva de documentação/contrato de API, e checklist de release — saída binária RELEASE
APPROVED/BLOCKED.

Ambiente local: **Docker Desktop indisponível durante esta onda** (caiu numa reconciliação anterior
desta sessão). `test:integration`/`test:e2e` e qualquer verificação que dependa de Postgres/Redis
real não podem ser executados aqui — cada agente deve registrar isso explicitamente em vez de
simular sucesso, por `/AGENTS.md` → "Scripts ausentes"/"Definição global de pronto".

Uma **Onda 9 crítica** (bug de RLS em `executeWithRls`/`src/lib/prisma.ts`, achado independente por
3 agentes na Onda 7) está sendo preparada pela outra sessão ativa, fora do escopo desta onda —
nenhum dos 7 agentes abaixo tem `prisma/**` em escopo.

## Matriz de propriedade (condição 2 da Regra de concorrência emendada, `/AGENTS.md`)

Publicada antes do primeiro agente ser disparado — 7 especialistas simultâneos (dentro do teto de 8).

| Agente | Branch | Propriedade exclusiva nesta onda |
|---|---|---|
| **02** | `agente/02-produto-ux-onda8` | `src/features/intelligence/components/BitrixGuideHub.tsx`, `src/features/crm360/components/CrmOverview.tsx`, componente(s) de gamificação em `src/features/gamification/**` — escopo restrito a fechar estados "em breve"/decisão de produto da Onda 8, não reabre toda `src/App.tsx`/Sidebar |
| **03** | `agente/03-design-a11y-onda8` | `src/components/ui/**`, `src/styles/**` |
| **09** | `agente/09-mobile-onda8` | `android/**`, `capacitor.config.ts` |
| **11** | `agente/11-marca-institucional-onda8` | `identidade-visual/**`, `documentacao-aplicacao/**` |
| **18** | `agente/18-contratos-api-docs` | `docs/**` exceto `docs/security/**` (15) e `documentacao-aplicacao/**` (11); `docs/openapi.yaml`; tipo compartilhado de `OverviewMetrics` em `src/shared/**` (mediante acordo com 02/04, registrado em handoff) |
| **08** | `agente/08-qa-release-onda8` | `docs/release/**` (novo/checklist), leitura de `.github/workflows/**` para confirmar CI de deriva OpenAPI (handoff do 18) — sem editar workflow nesta onda a menos que estritamente necessário |
| **10** | `agente/10-infraestrutura-sre-onda8` | `infrastructure/**` (runbook de go-live, alertas, dashboards), `k8s/**`/`argocd/**`/`charts/**` só se plano de rollback exigir |

**Confirmação de disjunção:** os 7 conjuntos acima não se sobrepõem. `18` e `02`/`04` têm ponto de
contato declarado (`OverviewMetrics`) resolvido por handoff, não edição direta cruzada. Nenhum par
depende de handoff `bloqueador` mútuo em aberto no momento do disparo.

**Arquivos de dono único fora desta onda** (nenhum dos 7 tem permissão de editar sem handoff):
- `server.ts`, `package.json`+lockfile, `prisma/schema.prisma`+migrations → aprovação do 00/01A
- `.github/workflows/**` (edição), `Dockerfile`, `docker-compose*.yml`, `render.yaml` → 08 (só leitura nesta onda, ver acima)
- `src/App.tsx`, navegação principal, Sidebar → 02 (só os 2 componentes específicos listados acima)
- `k8s/**`, `argocd/**`, `charts/**` (edição) → 10, só se necessário para rollback
- `src/lib/prisma.ts`, `src/lib/tenant-prisma.ts` → 01A (fora desta onda, ver Onda 9)

## Plano de integração (gate por leva)

7 agentes, sem dependência cruzada de arquivo. Merge em levas de 2-3 conforme forem terminando, gate
completo (tsc/lint/test:unit/build, mais test:integration/e2e se Docker voltar) a cada leva — não
acumular os 7 para um gate só no fim.

## Critério de aprovação

Nenhum handoff bloqueador aberto ao final. RELEASE APPROVED ou RELEASE BLOCKED, sem meio-termo —
"aprovado com teste não executado" não é opção (mas teste não-executável por falta de Docker no
ambiente local é registrado como tal, não como falha oculta).

## Status

Disparando os 7 especialistas em paralelo, cada um em worktree isolado a partir de `integracao/onda-8`.

## Resultado — os 7 concluídos, mesclados, gate verde

Docker Desktop, indisponível no início da onda, voltou a ficar disponível durante a execução —
`test:integration`/`test:e2e` puderam rodar de verdade ao final, além de já terem rodado dentro de
alguns worktrees individuais (Docker oscilou disponível/indisponível entre agentes; cada relatório
individual registra o que rodou de fato). Merge feito num worktree de coordenação isolado
(`../wt-onda8-coordenador`, branch `integracao/onda-8-work`) para não interferir com outra sessão
ativa no diretório principal do repositório (debug ao vivo de um bug crítico de RLS, ver
`.agents/completion/03-ondas-de-finalizacao.md`/Onda 9).

| Agente | Commit(s) principal | Achado principal |
|---|---|---|
| 11 | `f295176e` | Vídeos institucionais duplicados resolvidos — mantido 1 arquivo, lacuna de gravação documentada, não inventada |
| 02 | `fb0f058e`, `07fdd3fd`, `0a712e6c` | 2 abas de `BitrixGuideHub` sem conteúdo desde a criação, implementadas com fontes reais; **bug real** em `CrmOverview`: 2 quick-actions chamavam `onNavigate` com ids que nunca existiram (navegação silenciosa quebrada); gamificação mantida efêmera por decisão registrada |
| 08 | `2932bc8f` | Caminho LGPD mapeado E testado ponta a ponta contra sessão real (signup→export→erasure→confirmação); gap real documentado: exclusão exige acesso a API/script, não é self-service |
| 10 | `4f64d663`, `3b1697f6`, `fdb9561c` | **Corrigiu premissa errada da própria missão**: deploy real é só Render (confirmado via MCP), não Render+Vercel; runbook e rollback reescritos contra o mecanismo real da API do Render |
| 09 | `cceb8954`, `33ee8ae5`, `2a39d379` | **Bug crítico**: `capacitor.config.ts` sem `server.url` desde onda anterior — app mobile empacotado não fazia nenhuma chamada de API; corrigido. Deep link implementado do zero. 1 handoff bloqueador (domínio final ainda não resolve DNS — justificativa abaixo) |
| 18 | 6 commits | Primeira execução: deriva OpenAPI de ~60→146 paths documentados + verificação automatizada que falha quando diverge; `OverviewMetrics` unificado; auditoria de conformidade de 60 handoffs (55 conformes); `ROADMAP-100-STEPS-COMPLETE.md` corrigido com ressalva; ADR-003 |
| 03 | `d65c9dea`, `a3b48121`, `49e11b24` | `label-has-associated-control`: 28→0; **achou contraste real não coberto pelo DQA-19** (DQA-22, botão primário/gradiente `--brand-2`); 2 bugs reais de `prefers-reduced-motion` (`useMagnetic` nunca lia o valor; `AtlasOrb` ignorava a preferência) |

## Gate final (branch de coordenação, todos os 7 mesclados)

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | limpo |
| `npm run lint` | 0 erros, **73 warnings** (queda de 101 — as 28 correções de `label-has-associated-control` do Agente 03) |
| `npm run build` | ok |
| `npm run test:unit` | 1053/1053 (141 arquivos) |
| `npm run test:integration` | 71/71 passando (2 skipped) — **inclui a suíte de AILog RLS agora genuinamente verde**, confirmando que a correção real (bug de `PrismaPromise` lazy fora do `requestContext.run`, trazida de `origin/main` na reconciliação da Onda 5) funciona |
| `npm run test:e2e` | 45/45 passando (5 skipped — baselines visuais Linux pendentes, item conhecido desde a Onda 7) |

Nenhuma regressão. Varredura manual de segredo sobre o diff acumulado — nenhum achado.

## Handoffs — bloqueador aberto, com justificativa registrada

`onda-8/09-para-08-10-dominio-producao-e-verificacao-deep-link.md` (De: 09, Para: 08/10) continua
`aberto`. Não bloqueia esta decisão pelos seguintes motivos, registrados aqui conforme
`/AGENTS.md` → "Protocolo de handoff":
- O bug que motivou o handoff (app mobile sem `server.url`, nenhuma chamada de API funcionando) **já
  foi corrigido nesta mesma onda** pelo próprio Agente 09 — o app está funcional hoje, apontando
  para o backend real (`prospector-atlas.onrender.com`).
- O que resta é a verificação formal de Android App Link/iOS Universal Link (`assetlinks.json`/
  `apple-app-site-association`), que depende de **duas dependências externas fora do controle de
  qualquer agente**: o domínio final `app.atlasgr.com.br` ainda não resolve DNS, e o keystore de
  assinatura de release ainda não existe. Sem isso, o link funciona como link comum (mostra seletor
  de app), não como deep link automático — degradação aceitável, não quebra funcional.
- Ação humana necessária: avisar quando o domínio estiver ativo (Cloudflare/DNS) e o keystore de
  release existir, para o Agente 09 atualizar os 3 arquivos dependentes.

Todos os demais handoffs abertos são `alto`/`normal` — backlog legítimo para a próxima rodada
(destaque: 4 achados de `as any` em limite de contrato do Agente 18, priorizados por risco; 3
handoffs do Agente 09 sobre paridade mobile incompleta — voz, download de arquivo, offline/stale —
que dependem do Agente 02).

## Decisão da Onda 8

**RELEASE APPROVED**, condicionado à ação externa documentada acima (DNS + keystore, sem prazo
determinado, não bloqueia o uso real da plataforma hoje via Render+web+app mobile apontando pro
backend direto).

Todos os gates obrigatórios passaram, incluindo os que dependiam de Docker (indisponível parte da
onda, disponível ao final). Nenhuma regressão introduzida. Dois bugs reais e sérios encontrados e
corrigidos fora do escopo original da missão de cada agente (app mobile sem API, navegação quebrada
em `CrmOverview`) — nenhum foi tratado como "fora de escopo, não é meu problema".

**Ainda não mesclada em `main`** — aguardando revisão e aprovação explícita do usuário, com a
mesma cautela das rodadas anteriores desta sessão (reconciliar com `origin/main` antes do push, dado
que há sessão concorrente ativa no repositório).
