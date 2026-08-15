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
