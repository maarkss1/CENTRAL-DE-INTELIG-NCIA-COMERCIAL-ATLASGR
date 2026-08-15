# Onda 6 — Estabilidade e Runtime

- Data: 2026-08-15
- Branch de integração: `integracao/onda-6`, criada a partir de `claude/new-session-dxa5kl`
  (não de `main` — o PR #119, com as correções de ENV-001, os prompts atualizados e a emenda de
  concorrência, ainda não foi mesclado; disparar a partir de `main` deixaria os 4 agentes sem essas
  correções).
- Executor: Agente 00 (Coordenador)
- Autorização: prompts dos 8 agentes novos aprovados explicitamente pelo usuário em 2026-08-15.

## Contexto

A meta original desta onda ("matar o ENV-001") já foi cumprida fora do ciclo formal nesta mesma
sessão: `test:integration` 48/48, `test:unit` 706/706, `prisma migrate deploy` 46/46 migrations,
E2E verde no CI (commit `18eeaba`). O handoff do RLS do `AILog` também foi fechado com execução real
(5/5). Os prompts 14 e 01A foram reescritos (commit `c4fed8c`) para refletir isso — a missão deles
nesta onda é confirmar/estabilizar, não redescobrir.

Onda reduzida de 6 para 4 especialistas (ver `.agents/completion/03-ondas-de-finalizacao.md` → Onda
6, commit `cb76cc7`). 08 e 10 saem do slot fixo desta onda — disponíveis por handoff.

## Matriz de propriedade (condição 2 da Regra de concorrência, `/AGENTS.md`)

Publicada antes do primeiro agente ser disparado, conforme exigido para rodar acima de 3
especialistas simultâneos.

| Agente | Branch | Worktree | Propriedade exclusiva nesta onda |
|---|---|---|---|
| **14** | `agente/14-ambiente-execucao-harness` | `../wt-agente-14` | `tests/**`, `vitest.*.config.ts`, `playwright.config.ts`, `scripts/test/**`, `.env.test.example` |
| **01A** | `agente/01A-dados-rls-retencao` | `../wt-agente-01A` | `prisma/schema.prisma`, `prisma/migrations/**`, `src/lib/tenant-prisma.ts`, `src/lib/prisma.ts`, `src/lib/async-context.ts`, `scripts/db/**` |
| **15** | `agente/15-seguranca-aplicada` | `../wt-agente-15` | `docs/security/**`, `scripts/security/**` (novo), `src/lib/security/**` |
| **16** | `agente/16-runtime-workers-escala` | `../wt-agente-16` | `src/lib/queue/**`, `src/lib/process-guards.ts`, novo `worker.ts` (raiz) |

**Confirmação de disjunção:** os quatro conjuntos de arquivos acima não se sobrepõem. Nenhum par
depende de handoff `bloqueador` mútuo em aberto no momento do disparo.

**Arquivos de dono único fora desta onda** (nenhum dos 4 tem permissão de editar, mesmo que precise —
abrem handoff):
- `server.ts` → aprovação explícita do 00
- `package.json` + lockfile → aprovação explícita do 00
- `.github/workflows/**`, `Dockerfile`, `docker-compose*.yml`, `render.yaml` → 08 (fora da onda, por handoff)
- `k8s/**`, `argocd/**`, `charts/**`, `infrastructure/**` → 10 (fora da onda, por handoff)

## Plano de integração (gate por leva)

Com 4 agentes e nenhuma dependência cruzada, a leva é única: mesclar os 4 em `integracao/onda-6` na
ordem em que terminarem, rodar o gate completo após cada merge (não acumular os 4 para um gate só no
fim, conforme a regra).

## Critério de aprovação

Gate roda 2× seguidas sem depender dos 2 retries do Playwright para fechar verde. Itens de
segurança (15) e runtime (16) fecham. Nenhuma regressão nos números de 2026-08-15 confirmada por
14 e 01A.

## Status

Disparando os 4 especialistas em paralelo, cada um em worktree isolado.
