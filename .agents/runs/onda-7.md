# Onda 7 — Autonomia Comercial Real

- Data: 2026-08-15
- Branch de integração: `integracao/onda-7`, criada a partir de `main` (commit `a279fae`, já com a
  Onda 6 e a remediação pós-Onda 6 integradas).
- Executor: Agente 00 (Coordenador)
- Autorização: usuário pediu explicitamente o início da Onda 7.

## Contexto

Meta da onda: o piloto automático 24/7 sustenta um ciclo comercial inteiro, não só o primeiro
e-mail (ver `AUTONOMIA_COMERCIAL_24X7.md` → "Próximas integrações"). Trava de produto que não pode
ser afrouxada: a transição para `Negócios Ganhos` continua exigindo evento verificável
(aceite/assinatura/confirmação de CRM), nunca texto gerado por modelo.

Handoffs abertos relevantes para agentes desta onda (nenhum bloqueador):
- `onda-5/01-para-06-persistencia-3cx-implementada.md` → 06
- `onda-6/01A-para-06-bitrix-extraction-run-schema.md` → 06/06A (retenção já confirmada em 90 dias)
- `onda-6/16-para-06-plano-migracao-baileys.md` → 06 (plano de coordenação futura, não executar
  ainda — sessões Baileys continuam no processo HTTP)
- `onda-1/01-para-04-role-gates-crm.md` → 04

## Matriz de propriedade (condição 2 da Regra de concorrência, `/AGENTS.md`)

Publicada antes do primeiro agente ser disparado — 7 especialistas simultâneos.

| Agente | Branch | Worktree | Propriedade exclusiva nesta onda |
|---|---|---|---|
| **13** | `agente/13-enxame-governanca` | `../wt-agente-13` | `src/features/intelligence/agents/**`; `src/features/intelligence/services/{guardrails,aiPendingAction,pending-actions,autonomyRoleRunner,swarmScheduler}.service.ts`; `src/features/intelligence/services/winLossAnalysis.worker.ts`; `src/features/intelligence/components/{SwarmDashboard,AIPendingActions}.tsx`; `src/lib/queue/swarmScheduler.worker.ts`; `src/lib/queue/agent.worker.ts`; `src/lib/security/piiSanitizer.ts` |
| **07** | `agente/07-ia-automacoes` | `../wt-agente-07` | `src/features/intelligence/**` **exceto** o que pertence ao 13 acima; `src/features/knowledge/**`; `src/features/automations/**` **exceto** `coldCallCampaign.api.ts` (12); `src/features/roleplay/**`; `src/lib/ai/**`; `src/lib/queue/**` **exceto** `coldCall.worker.ts` (12), `swarmScheduler.worker.ts` e `agent.worker.ts` (13); `server/ai/**` |
| **12** | `agente/12-voz-telefonia` | `../wt-agente-12` | `src/features/integrations/birth-voice/**`; `src/features/integrations/threecx/**`; `src/lib/queue/coldCall.worker.ts`; `src/features/automations/coldCallCampaign.api.ts`; `src/features/intelligence/services/voicebox.service.ts` |
| **17** | `agente/17-cadencia-ciclo-receita` | `../wt-agente-17` | `src/features/cadence/**` (novo) |
| **06** | `agente/06-integracoes-bitrix` | `../wt-agente-06` | `src/features/integrations/**` **exceto** `birth-voice/**` e `threecx/**` (12) |
| **05** | `agente/05-prospeccao` | `../wt-agente-05` | `src/features/prospecting/**`, `src/lib/enrichment/**` |
| **04** | `agente/04-crm-bi` | `../wt-agente-04` | `src/features/crm/**`, `src/features/companies/**`, `src/features/contacts/**`, `src/features/calendar/**`, `src/features/activities/**`, `src/features/analytics/**`, `src/features/reports/**` |

**Confirmação de disjunção:** os 7 conjuntos de arquivos acima não se sobrepõem — a divisão dentro
de `src/features/intelligence/**` (13 vs 07) e `src/lib/queue/**` (13/12/07) foi explicitada linha
a linha para evitar exatamente o tipo de colisão que já ocorreu uma vez na história do projeto
(Onda 5, `bitrixSync.worker.ts`, 06 × 07). Nenhum par depende de handoff `bloqueador` mútuo em
aberto no momento do disparo.

**Arquivos de dono único fora desta onda** (nenhum dos 7 tem permissão de editar — abrem handoff):
- `server.ts`, `package.json`+lockfile, `prisma/schema.prisma`+migrations → aprovação do 00/01A
- `.github/workflows/**`, `Dockerfile`, `docker-compose*.yml`, `render.yaml` → 08
- `src/App.tsx`, navegação, Sidebar → 02
- `k8s/**`, `argocd/**`, `charts/**`, `infrastructure/**` → 10

## Plano de integração (gate por leva)

7 agentes, sem dependência cruzada de arquivo — mas o Agente 17 depende de **acordo por escrito**
com 02 (rota), 01 (schema), 05/06/12 (canais) e 13 (evento de fechamento) **antes** de codar, per o
próprio prompt dele. Merge em levas de 2–3, gate completo a cada leva (não acumular os 7 para um
gate só no fim).

## Critério de aprovação

Gate roda 2× seguidas sem depender de retry para fechar verde. Trava do Closer (`Negócios Ganhos`
só por evento verificável) provada por teste, não assumida. Nenhuma regressão nos números herdados
da Onda 6/remediação.

## Status

Disparados os 7 especialistas em paralelo, cada um em worktree isolado.

### Leva 1 — mergeada (2026-08-15)

Agentes 05 (Prospecção) e 17 (Cadência) concluíram primeiro, com diff em escopo exclusivo
(confirmado via `git diff --stat` contra a matriz acima). Merge sem conflito. Gate na branch
`integracao/onda-7`: `tsc --noEmit` limpo, lint 0 erros/101 warnings (baseline), 822/822 testes
unitários, build ok. Push: `8a8e7c9`.

- Agente 05: TTL de cache em `enrichCompany`, dedupe de decisores por e-mail/telefone
  normalizado, 2 handoffs (proveniência para 01, rotulagem confirmado/inferido para 02).
- Agente 17: domínio `src/features/cadence/**` completo (opt-out unificado, máquina de estados
  da cadência, reply tracking, agendamento com trava de confirmação verificável, proposta
  versionada e fechamento determinístico), 94 testes próprios. 4 handoffs de contrato abertos
  (01 schema, 02 rota, 05/06/12 opt-out, 13 evento de fechamento) — implementação real das
  integrações depende desses handoffs serem aplicados pelos donos. **Pergunta pendente para o
  usuário** (não bloqueia o schema, que é agnóstico de provedor): qual provedor de assinatura
  eletrônica usar em `CrmDocumentSignatureRequest.provider` (Clicksign/DocuSign/Autentique etc.).

### Leva 2 — mergeada (2026-08-15)

Agente 04 (CRM/BI) concluiu com diff em escopo exclusivo. Merge sem conflito. Gate na branch
`integracao/onda-7`: `tsc --noEmit` limpo, lint 0 erros/101 warnings (baseline), 846/846 testes
unitários, build ok. Push: `f4e708d`.

- Resolveu handoff `onda-1/01-para-04-role-gates-crm.md` (limiares de role confirmados corretos).
- Corrigiu 2 bugs reais de BI: `AnalyticsUseCases.ts` (caminho realmente ligado via DI ao
  `/api/analytics/dashboard`) hardcodava `tmqMetric`/`lostReasons`/`callHeatmap`/
  `performanceReport` vazios — os widgets do dashboard ficavam sempre vazios independente dos
  dados reais. Religou às queries reais do `PrismaAnalyticsRepository`. `callHeatmap` também
  filtrava por `Activity.type === 'call'`, valor que não existe no enum Prisma (`Ligacao` é o
  valor real) — heatmap sempre vazio mesmo com ligações reais registradas.
  Removeu `tmqMetric` fabricado (`updatedAt - createdAt` não mede tempo de qualificação real).
  Unificou definição de "pipeline aberto" entre dashboard e relatório PDF (`CLOSED_STATUSES`).
  Removeu `comparative.service.ts` morto (zero chamadores, guarda de tenant citava role
  inexistente).
- Guard contra owner fictício (`src/features/activities/domain/ownerGuard.ts`) — rejeita
  placeholders como "Enxame de IA Atlas" como responsável por atividade/tarefa.
- 2 handoffs abertos: `04-para-06-owner-bitrix-nome-nao-id.md` (Bitrix guarda nome em vez de id
  de owner, quebra `requireLeadOwnership`) e `04-para-07-owner-fabricado-follow-up-ia.md`
  (`opsTools.ts` fabricava owner "Enxame de IA Atlas" em follow-up gerado por IA).

### Leva 3 — mergeada (2026-08-15)

Agente 06 (Integrações/Bitrix) concluiu com diff em escopo exclusivo. Merge sem conflito. Gate na
branch `integracao/onda-7`: `tsc --noEmit` limpo, lint 0 erros/101 warnings (baseline), 902/902
testes unitários, build ok. Push: `64e482f`.

- Corrigiu gap real de observabilidade: webhook de entrada Bitrix→Atlas registrava falha em
  `BitrixSyncLog`/log de app mas nunca incrementava `bitrix_sync_failures_total` — a métrica que
  a regra de alerta `BitrixSyncFailuresHigh` observa. Corrigido.
- Serviço real de Extrações Bitrix completo (6 entidades, 7 presets de período, paginação com
  retry/backoff, teto de 500 páginas, cancelamento cooperativo, export CSV/XLSX/JSON, isolamento
  de tenant), rotas ADMIN/GESTOR, painel `BitrixExtractionPanel.tsx` na aba Bitrix24. "Analisar
  com IA" documentado como pendência explícita (depende da infraestrutura do Agente 07, fora do
  escopo do 06). Execução fire-and-forget no processo HTTP (mesmo padrão de `pushLeadToBitrix`),
  não worker BullMQ novo — evita mexer em `worker.ts`/`server.ts`.
- Resolveu handoff de levantamento de sessões Baileys (16→06) sem mover nada — documentou onde a
  sessão vive hoje (`Map` module-level em `whatsapp.service.ts`, credenciais em disco local).
- Revisou handoff 3CX (onda-5, 01→06): campos de model confirmados; `process3CXWebhook` ainda só
  loga, não persiste — como `threecx/**` passou a ser do Agente 12 nesta onda, redirecionado via
  `06-para-12-3cx-webhook-persistencia.md`.

### Pendente

Agentes 13 (Enxame/Governança), 07 (IA/Automações), 12 (Voz/Telefonia) ainda em execução.
