# Ondas de Finalização — Roster ampliado (5 a 10 agentes por onda)

- Data: 2026-08-14
- Base: `.agents/completion/02-mapa-plataforma.md` (mapa completo) + handoffs abertos + `AGENTS.md`.
- Objetivo: **terminar a plataforma**, não adicionar módulo novo. Cada agente proposto abaixo existe
  porque há um item rastreável em aberto — não porque "faltava um papel bonito no organograma".

---

## 0. Regra de concorrência — já emendada

Ondas de 5 a 10 agentes violavam a regra global anterior de `AGENTS.md` ("no máximo 3 especialistas
simultâneos... nunca iniciar 4 ao mesmo tempo"). **A emenda foi aplicada** (autorização explícita do
dono do repositório, 2026-08-14): o teto passou a 8 simultâneos, condicionado.

O que motivou a revisão foi o histórico executado do próprio repositório, não preferência de
processo. Nenhuma falha real de execução foi causada pela quantidade de agentes:

| Onda | Especialistas | Simultâneos | Conflito de merge | Incidente |
|---|---|---|---|---|
| 1 | 3 | 3 | — | Workflow falhou nos 3 por **limite de sessão da conta**; worktrees nasceram da branch errada por corrida do Coordenador com outra sessão → 16 commits cherry-picked um a um |
| 2 | 3 | 3 | nenhum | — |
| 4 | 2 | 2 | nenhum | — |
| 5 | 4 | 3 | **1** (`src/lib/queue/bitrixSync.worker.ts`) | Gate da integração pegou falha de RLS do `AILog` que os gates individuais não pegaram |

Leitura dos três incidentes:

- **O único conflito de merge da história** foi sobreposição legítima de propriedade — 06 é dono do
  sync Bitrix, 07 é dono das métricas de fila, e aquele worker é os dois. Teria acontecido com 2
  agentes. É problema de **matriz de propriedade**, não de contagem.
- **O incidente mais caro** (16 cherry-picks) foi corrida do Coordenador sobre checkout
  compartilhado. Problema de **isolamento**, não de contagem.
- **A falha da primeira tentativa** foi limite de sessão/token da conta. Problema de **capacidade da
  ferramenta**, não de contagem.

Conclusão que ficou escrita na regra: o que escala mal não é o número de agentes trabalhando em
paralelo, é o número de **merges acumulados sem gate** — porque o custo de bisect quando a branch de
integração fica vermelha cresce mais que linearmente.

### O que a regra emendada exige (resumo — texto normativo em `/AGENTS.md`)

1. isolamento por worktree/branch (inalterado, vale em qualquer N);
2. **propriedade disjunta verificada antes de disparar**, com matriz publicada em
   `.agents/runs/onda-<n>.md` — sobreposição se resolve no papel, não no merge;
3. **gate por leva de 2–3 merges**, nunca a onda inteira num gate só;
4. sem handoff `bloqueador` mútuo entre agentes ativos;
5. dono único para `server.ts`, `package.json`/lockfile e `prisma/schema.prisma`;
6. reduzir N se a ferramenta ou o limite de sessão não sustentarem — agente derrubado no meio da
   missão custa mais que agente que esperou a vez.

E uma orientação de adoção: ao subir de 3 pela primeira vez, escalonar `3 → 4 → 6` em vez de ir
direto ao teto.

`.agents/prompts/00-coordenador.md` foi atualizado na sequência, com autorização explícita do dono
do repositório — era o único ponto que ainda declarava "capacidade para 4 agentes totais" e teto de
3 especialistas, e que portanto anularia a emenda na prática. Nenhum resíduo do teto antigo
permanece em `AGENTS.md`, `EXECUCAO-ONDAS.md`, `.agents/prompts/**`, `.agents/README.md` ou
`.agents/COMO-CHAMAR-OS-AGENTES.md`.

As menções ao limite de 3 em `.agents/runs/**` foram preservadas de propósito: são registro
histórico do que aconteceu em cada onda, não diretriz vigente.

---

## 1. Roster completo após a ampliação

| # | Agente | Situação |
|---|---|---|
| 00 | Coordenador | existe |
| 01 | Plataforma, Segurança e Dados | existe |
| 01A | **Confiabilidade de Dados, RLS e Retenção** | **novo** — especialista interno do 01, mesmo slot (padrão 06A) |
| 02 | Produto e UX | existe |
| 03 | Design e Acessibilidade | existe |
| 04 | CRM e BI | existe |
| 05 | Prospecção | existe |
| 06 | Integrações e Bitrix | existe |
| 06A | Extrações Bitrix | existe |
| 07 | IA e Automações | existe |
| 08 | QA e Release | existe |
| 09 | Mobile | existe |
| 10 | Infraestrutura, Observabilidade e SRE | existe |
| 11 | Marca e Ativos Institucionais | existe |
| 12 | **Voz e Telefonia (Birthub Voices / 3CX)** | **declarado em `AGENTS.md:22`, prompt inexistente — criar** |
| 13 | **Enxame Autônomo e Governança de Agentes** | **novo** |
| 14 | **Ambiente de Execução e Test Harness** | **novo** |
| 15 | **Segurança Aplicada e Rotação de Segredos** | **novo** |
| 16 | **Runtime, Workers e Escala** | **novo** |
| 17 | **Cadência Multicanal e Ciclo de Receita** | **novo** |
| 18 | **Contratos, API e Documentação Viva** | **novo** |

**7 agentes a criar** (12, 13, 14, 15, 16, 17, 18) + **1 especialista interno** (01A).

---

## 2. Por que cada agente novo existe (justificativa rastreável)

| Agente | Item aberto que o justifica |
|---|---|
| **12 — Voz e Telefonia** | `AGENTS.md:22` declara o agente; `.agents/prompts/12-*.md` não existe. Birth Voice, 3CX, `coldCall.policy`, `CallSuppression`, webhook `voice-result` e fallback WhatsApp hoje têm dois donos parciais (06 e 07) e nenhum dono formal. Handoff `onda-5/01-para-06-persistencia-3cx-implementada.md` segue aberto. |
| **13 — Enxame e Governança de Agentes** | Os 8 agentes de runtime, `AIPendingAction`, modos `supervised`/`full`, `guardrails.service`, `swarmScheduler` e o **painel de SLO por agente** (pedido em `AUTONOMIA_COMERCIAL_24X7.md`, não implementado) estão diluídos dentro do 07, que também carrega RAG, filas e automações. |
| **14 — Ambiente de Execução e Test Harness** | **ENV-001**: `test:integration`/`test:e2e` bloqueados e migrations nunca aplicadas contra Postgres real em `PLATFORM_COMPLETION_REPORT.md` e em todas as rodadas seguintes. É o maior bloqueio único da plataforma — nenhuma aprovação de onda é honesta enquanto ele existir. |
| **01A — Dados, RLS e Retenção** | `onda-2/00-para-01-ailog-rls-violation.md` (**alto, aberto**): 2 de 5 testes de RLS do `AILog` falham; hipótese de `SET` vazando entre conexões pooled. Mais `BitrixExtractionRun` travado em decisão de retenção. Schema tem dono exclusivo (01), então isto é especialista interno, não slot novo. |
| **15 — Segurança Aplicada** | 3 ações externas obrigatórias em aberto (rotação Bland, rotação de 2 webhooks Bitrix, decisão sobre `filter-repo` do dump no histórico) + 4 vulnerabilidades moderate + `security:zap`/`security:trivy` existem em `package.json` mas não constam de nenhum gate. |
| **16 — Runtime, Workers e Escala** | Débito arquitetural explícito em `01-bloqueadores.md`: 13 filas + cron + sessões Baileys dentro do processo HTTP; `process-guards.ts` engolindo `unhandledRejection` global; graceful shutdown que não fecha HTTP/SSE/Redis. |
| **17 — Cadência Multicanal e Ciclo de Receita** | As 6 lacunas de `AUTONOMIA_COMERCIAL_24X7.md` → "Próximas integrações", nenhuma implementada. Sem elas o "piloto automático" para no primeiro e-mail. |
| **18 — Contratos, API e Documentação Viva** | `docs/openapi.yaml` sem verificação de deriva; `OverviewMetrics` duplicado entre front e back sem fonte compartilhada (registrado como débito real); `onda-3/07-para-11-lgpd-service-fix.md` fora do formato do protocolo. |

---

## 3. As três ondas

### Onda 6 — Estabilidade e Runtime (4 especialistas)

**Atualização de 2026-08-15:** a meta original desta onda ("matar o ENV-001") **já foi cumprida**,
fora do ciclo formal — `test:integration` 48/48, `test:unit` 706/706, `prisma migrate deploy` 46/46,
E2E verde no CI. O handoff do RLS do `AILog` também foi fechado com execução real (5/5). Os prompts
14 e 01A foram reescritos para refletir isso: a missão deles nesta onda é **confirmar/estabilizar**,
não mais "diagnosticar e destravar". Isso libera o peso da onda — ela fica menor e mais rápida do
que planejada originalmente.

**Meta desta onda, revisada:** os itens que continuam genuinamente abertos fecham — segurança
aplicada, runtime fora do processo HTTP — com o gate confirmado estável (não só verde uma vez) ao
final.

| Agente | Missão da onda | Propriedade exclusiva |
|---|---|---|
| **14** | Confirmar que o gate se reproduz no worktree; baselines visuais Linux; acompanhar o flake conhecido de `crm-kanban.spec.ts` no CI | `tests/**`, `vitest.*.config.ts`, `playwright.config.ts`, `scripts/test/**` |
| **01A** | Confirmar RLS do `AILog` (2ª confirmação independente); varredura de SQL cru fora de contexto; schema de `BitrixExtractionRun` | `prisma/schema.prisma`, `prisma/migrations/**` (slot do 01) |
| **15** | Rotação de segredos, `gitleaks`/`trivy`/`zap` no gate, `npm audit` moderate, decisão de `filter-repo` | `docs/security/**`, `scripts/security/**` (a criar) |
| **16** | Separar workers e Baileys do processo HTTP (entrypoint próprio), graceful shutdown completo, estreitar `process-guards` | `src/lib/queue/**`, novo `worker.ts` |

**08 e 10 saem da onda formal** — não há mais trabalho independente de CI/deploy/infra amarrado a
ENV-001. Ficam disponíveis por handoff se 15 ou 16 precisarem tocar `Dockerfile`/`render.yaml`/`k8s/**`,
mas não ocupam slot.

**Critério de aprovação:** o gate roda 2× seguidas sem depender dos 2 retries do Playwright para
fechar verde. Item de segurança e runtime fecham; nenhuma regressão nos números de 2026-08-15.

---

### Onda 7 — Autonomia Comercial Real (7 especialistas)

**Meta:** o piloto automático 24/7 sustenta um ciclo comercial inteiro, não só o primeiro e-mail.

| Agente | Missão da onda |
|---|---|
| **13** | Painel de SLO por agente (cobertura, conversão, custo, latência, erro, override humano); consentimento LGPD verificado antes de PII ir a provedor externo; `piiSanitizer` deixa de ser código morto |
| **07** | RAG com proveniência ponta a ponta; ampliar o motor de automação além de 3×3 gatilhos/ações; idempotência e dead-letter uniformes nas 13 filas |
| **12** | Voz ponta a ponta: `coldCall.policy`, AMD, retry, `CallSuppression`, fallback WhatsApp, persistência 3CX (handoff aberto) |
| **17** | Proposta versionada + assinatura eletrônica; agendamento no Google Calendar após disponibilidade confirmada; **opt-out unificado** e-mail/WhatsApp/voz; reply tracking; fechamento determinístico por evento de aceite |
| **06** | Bitrix: sincronizações que não falham em silêncio; extrações completas (com 06A) |
| **05** | Proveniência de dado enriquecido: inferido × confirmado; não enriquecer além do necessário |
| **04** | Forecast rastreável; sem owner fictício; métricas comerciais com dono e origem |

**Trava de produto que não pode ser afrouxada nesta onda:** a transição para `Negócios Ganhos`
continua exigindo evento verificável (aceite/assinatura/confirmação de CRM), nunca texto gerado por
modelo — `AUTONOMIA_COMERCIAL_24X7.md` → "Critério honesto de Closer autônomo".

---

### Onda 8 — Acabamento e Go-Live (7 especialistas)

| Agente | Missão da onda |
|---|---|
| **02** | Fechar os últimos estados cenográficos ("em breve" em `BitrixGuideHub` e `CrmOverview`); decidir o produto da gamificação (XP efêmero) |
| **03** | Acessibilidade: fechar o débito de `label-has-associated-control`, contraste sobre cor de marca, `prefers-reduced-motion` |
| **09** | Paridade real no Android/iOS: nenhum recurso anunciado que não funcione no dispositivo |
| **11** | `onda-4/11-para-00-videos-institucionais-duplicados.md`; ativos institucionais |
| **18** | `openapi.yaml` sem deriva verificada em CI; fonte única para `OverviewMetrics`; normalizar `onda-3/07-para-11-lgpd-service-fix.md` no protocolo |
| **08** | Checklist de release: caminho operacional para solicitação de titular LGPD documentado e testado |
| **10** | Go-live: runbook, alertas, dashboards, plano de rollback |

**Saída:** `RELEASE APPROVED` ou `RELEASE BLOCKED`. Sem terceira opção, sem "aprovado com teste não
executado".

---

## 4. Matriz de propriedade (obrigatória antes de disparar cada onda)

O Coordenador publica isto em `.agents/runs/onda-<n>.md` **antes** do primeiro agente. Sem a matriz
publicada, a condição 2 da regra de concorrência de `/AGENTS.md` não está satisfeita e a onda não
pode rodar com mais de 3 especialistas.

Arquivos de dono único que **nunca** entram na matriz de mais de um agente:

| Arquivo | Dono |
|---|---|
| `prisma/schema.prisma` e `prisma/migrations/**` | 01 (ou 01A no slot dele) |
| `src/App.tsx`, navegação, Sidebar | 02 |
| `.github/workflows/**`, `Dockerfile`, `docker-compose.yml`, `render.yaml` | 08 |
| `k8s/**`, `argocd/**`, `charts/**`, `infrastructure/**` | 10 |
| `android/**`, `ios/**`, `capacitor.config.ts` | 09 |
| `identidade-visual/**`, `documentacao-aplicacao/**` | 11 |
| `server.ts` | 00 (aprovação explícita por alteração) |
| `package.json` + lockfile | 00 (aprovação explícita por alteração) |
| `.agents/prompts/**` | humano, fora do ciclo |
