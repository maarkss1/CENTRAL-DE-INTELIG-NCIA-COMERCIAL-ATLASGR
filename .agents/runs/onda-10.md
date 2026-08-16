# Onda 10 — Backlog pós-Onda 8 (mobile, contratos, owner fictício, cadência)

- Data: 2026-08-16
- Branch de integração: `integracao/onda-10`, a partir de `main` (`80b6951f`, já com a
  reatribuição da Onda 9 mergeada).
- Executor: Coordenador (00) — dispara e integra; nenhum trabalho de domínio é feito diretamente
  pelo Coordenador nesta onda, exceto o merge por leva.

## Contexto

Não existe onda formal "9" ou "10" pré-definida em `.agents/completion/03-ondas-de-finalizacao.md`
— esse plano previa só as Ondas 6, 7 e 8, todas concluídas, com a Onda 8 fechando
`RELEASE APPROVED`. `.agents/runs/onda-9.md` foi um fix pontual (RLS/AsyncLocalStorage), não uma
onda com roster.

Esta Onda 10 nasce do backlog real de handoffs abertos de prioridade alta levantado após a Onda 8,
a pedido explícito do usuário (definir e disparar a próxima onda). Escopo escolhido, dos 4 temas
apresentados ao usuário: paridade mobile, dívida de contrato/tipo, owner fictício, cadência
comercial. Fora de escopo desta onda (fica de backlog): rotação de segredos externos (ação humana),
verificação de deep link (bloqueada por DNS/keystore, ação humana), duplicação de contrato de
`commercial-intelligence` (grande demais, sem dono confirmado ainda).

## Limitação de ambiente conhecida

Este ambiente de execução **não tem Docker/Postgres disponíveis** (`docker ps` falha: "Cannot
connect to the Docker daemon"). Nenhum especialista desta onda consegue rodar
`test:integration`/`test:e2e` localmente. Gate aplicável nesta onda, por especialista: `tsc --noEmit`,
`lint`, `test:unit` (com Prisma mockado, não precisa de banco), `build`. Verificação real contra
Postgres (migrations, RLS, testes de integração) fica para o CI do PR — cada especialista deve
registrar isso explicitamente na evidência, não pular a linha em silêncio (`/AGENTS.md` → "Scripts
ausentes", mesmo princípio aplicado a serviço externo ausente, não só script ausente).

## Matriz de propriedade (antes do primeiro agente)

| Agente | Slot | Arquivos sob propriedade nesta onda |
|---|---|---|
| 01A | Dados, RLS e Retenção (interno do 01) | `prisma/schema.prisma`, `prisma/migrations/**` (dono exclusivo, inalterado) |
| 02 | Produto e UX | `src/lib/navigationBus.ts`, `src/App.tsx` (rotas), `src/components/layout/Sidebar.tsx`/`MainLayout.tsx`, `src/hooks/useOnlineStatus.ts` (novo), `src/features/analytics/analytics.api.ts` |
| 04 | CRM e BI | `src/features/analytics/domain/Analytics.ts`, `src/features/analytics/analytics.service.ts`, `src/features/crm360/services/crm360.service.ts` |
| 06 | Integrações e Bitrix | `src/features/integrations/bitrix/service/userMapping.ts`, `src/features/integrations/bitrix/service/leads.ts`, `src/features/integrations/bitrix/service/deals.ts` |
| 07 | IA e Automações | `src/features/intelligence/tools/opsTools.ts`, `src/features/intelligence/services/aiPendingAction.service.ts` |

Arquivo compartilhado entre 02 e 04 (`src/shared/contracts/analytics.contract.ts`, já existe,
criado na Onda 8 pelo Agente 18): só leitura de tipo por ambos, nenhum dos dois edita a forma do
contrato nesta onda — só trocam a declaração local pelo import. Sem sobreposição de escrita.

Nenhuma sobreposição de arquivo entre os 5 especialistas desta leva. `server.ts`,
`package.json`/lockfile não são tocados por nenhum deles nesta leva.

## Roster — Leva 1 (5 especialistas, paralelo, worktree isolado)

Worktrees: `../wt-agente-01A`, `../wt-agente-02`, `../wt-agente-04`, `../wt-agente-06`,
`../wt-agente-07`, cada um a partir de `integracao/onda-10`, branch própria
(`agente/01A-cadencia-schema`, `agente/02-mobile-contratos`, `agente/04-bi-contratos`,
`agente/06-bitrix-owner`, `agente/07-ai-owner`).

| Agente | Missão | Handoff(s) de origem |
|---|---|---|
| **01A** | Aplicar o schema de cadência/opt-out/proposta/assinatura/fechamento proposto pelo Agente 17 (itens 2-5 — `OptOutRecord`/item 1 já aplicado): `CadenceSequence`, `CadenceRun`, `CadenceTouchAttempt`, `ConversationSignal.channel`, `EmailMessage`, `CadenceCalendarEvent`, `CrmCommercialDocumentVersion`, `CrmDocumentSignatureRequest`, `DealClosureEvent`, todos com RLS idêntica ao padrão já usado. | `.agents/handoffs/onda-7/17-para-01-schema-cadencia-optout-proposta.md` |
| **02** | (a) `TAB_ROUTE_SET`: decidir entre criar rotas reais para `enrich`/`prompts` ou removê-los do contrato de navegação; (b) `useOnlineStatus()` + banner de "sem conexão" em `MainLayout`; (c) `OverviewMetrics` em `analytics.api.ts`: importar do contrato compartilhado em vez de redeclarar. | `onda-8/09-para-02-navigationbus-rotas-ausentes.md`, `onda-8/09-para-02-offline-stale-state-ausente.md`, `onda-8/18-para-02-unificar-overviewmetrics-frontend.md` |
| **04** | (a) `OverviewMetrics` em `Analytics.ts`/`analytics.service.ts`: importar do contrato compartilhado (confirmar `weeklyPdfReport.worker.ts` continua compilando); (b) `crm360.service.ts`: tipar o retorno do `groupBy` do Prisma (linhas 200-201, risco alto — valor monetário) e trocar `as any` de `customFields` por `Prisma.InputJsonValue` (linhas 339/404/431). | `onda-8/18-para-04-unificar-overviewmetrics.md`, `onda-8/18-para-04-as-any-crm360-prisma-aggregate.md` |
| **06** | Padronizar `Lead.owner` para sempre gravar `User.id` (nunca `User.name`) também no caminho de import do Bitrix — `userMapping.ts`/`leads.ts:258`/`deals.ts:349`. Backfill de dados já existentes fica registrado como handoff a 01 (decisão de dado real, fora do escopo do agente sozinho), não executado nesta onda. | `onda-7/04-para-06-owner-bitrix-nome-nao-id.md` |
| **07** | `createFollowUpTaskTool` (`opsTools.ts:31`) e `aiPendingAction.service.ts:78`: resolver responsável real (ex.: `Lead.owner` do próprio lead) em vez do literal `'Enxame de IA Atlas'`/`'Enxame de IA AtlasGR'`; se não houver responsável, falhar de forma visível em vez de fabricar. | `onda-7/04-para-07-owner-fabricado-follow-up-ia.md` |

## Roster — Leva 2 (depois do merge de 01A)

| Agente | Missão | Depende de |
|---|---|---|
| **17** | Adaptadores Prisma reais (`PrismaCadenceRunRepository` etc.) implementando as portas já testadas em `src/features/cadence/**`, substituindo os repositórios em memória; componente `CadenceHub.tsx` (registros de opt-out, execuções de cadência, e os itens 3-5 quando prontos). | Schema aplicado por 01A (Leva 1) |
| **02** (retorno rápido) | Aplicar rota `/app/cadence` + item de menu, apontando para `CadenceHub.tsx`. | Componente entregue por 17 |

## Critério de aprovação

Gate por leva (2-3 merges por vez, nunca a onda inteira de uma vez), rodado em
`integracao/onda-10`: `tsc --noEmit`, `lint`, `test:unit`, `build` — todos limpos, sem regressão nos
números da Onda 9 (1065+/1065+ unitários, 0 erros de lint). `test:integration`/`test:e2e` registrados
como "não executável neste ambiente" e delegados ao CI do PR antes do merge final em `main`.

Nenhum handoff `bloqueador` mútuo entre os 5 especialistas da Leva 1 (confirmado acima — arquivos
disjuntos). Handoffs não resolvidos nesta onda (ex.: backfill de `Lead.owner`, duplicação de
`commercial-intelligence`, deep link/DNS) seguem para o próximo ciclo, registrados no relatório
final.

## Status

Leva 1 concluída — 5 especialistas mesclados em `integracao/onda-10` sem nenhum conflito (matriz de
propriedade se provou correta na prática). Gate final na branch de integração: `tsc`/`prisma
validate`/`prisma generate` limpos, `lint` 0 erros (68 warnings, baseline), `test:unit` 150/150
arquivos (1124/1124 testes), `build` ok. `test:integration`/`test:e2e` não executáveis neste
ambiente (sem Docker/Postgres) — delegados ao CI do PR.

PR #132 mergeado em `main` (squash, commit `97aef70c`).

**Leva 2 concluída** — Agente 17 (`PrismaCadenceRunRepository`, rotas `/api/cadence/*`,
`CadenceHub.tsx`) e Agente 02 (rota `/app/cadence` + menu + contrato de navegação), sequenciais
(02 dependia do componente do 17), mescladas sem conflito em `integracao/onda-10-leva2`. Gate:
`tsc`/`prisma generate` limpos, `lint` 0 erros, `test:unit` 154/154 arquivos (1189/1189 testes),
`build` ok. `test:integration`/`test:e2e` não executáveis neste ambiente — delegados ao CI.

PR aberto como draft: #134.

Reply-tracking, agendamento e proposta/assinatura/fechamento (entregas 3-5 do Agente 17) ficam para
uma leva futura — sem API/adaptador ainda, `CadenceHub.tsx` mostra nota honesta em vez de dado
fabricado.
