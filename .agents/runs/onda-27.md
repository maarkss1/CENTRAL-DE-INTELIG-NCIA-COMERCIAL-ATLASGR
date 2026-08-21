# Onda 27 — CYC-004: agendamento Google com confirmação verificável

## Contexto

Item 6/15 da rodada "resolver todas as pendências" (`docs/CADENCE-CYCLE-AUDIT.md` /
`docs/AI-SWARM-GOVERNANCE-AUDIT.md`, Sprint 06/07). Segue diretamente o hotfix da onda anterior
(reconciliação do schema duplicado de Account Intelligence, PR #194) e o merge de CYC-003 (PR
#193).

**Estado de entrada (auditoria)**: `scheduling.ts` — domínio puro com guardrails contra confirmação
inferida por IA (`isVerifiableConfirmation`, `FORBIDDEN_EVIDENCE_MARKERS`) — testado unitariamente
mas sem nenhum caller de produção. A integração Google real (`google.service.ts`) só tinha OAuth +
leitura (`getUpcomingCalendarEvents`); nenhuma criação de evento em lugar nenhum do código.
`CadenceCalendarEvent` era tabela morta confirmada.

## Decisão de produto

Segue a decisão já confirmada nesta rodada para integrações que dependem de credencial/escopo
externo ainda não disponível (mesma categoria de CYC-003): **construir a arquitetura completa com
um stub da chamada externa**, pronta para plugar a credencial/escopo real depois.

Aplicado aqui de forma mais específica que CYC-003: a integração OAuth com o Google **já existe e
já funciona de verdade** para leitura. O gap não é "nenhuma credencial" — é que o escopo hoje
conectado (`calendar.readonly`) não permite escrever eventos. Pedir `calendar.events` forçaria
reconsentimento de toda organização já conectada ao Google (mudança de produto visível para
usuários reais, não uma decisão técnica isolada). Por isso, a chamada real ao Google
(`createEvent`) é o stub; tudo o resto — rota, guardrails do domínio, `Note` de evidência,
persistência de `CadenceCalendarEvent`, vínculo com `CadenceRun` ativo — é real e testado contra
Postgres.

Dos 3 tipos de evidência que o domínio aceita, só `manual-verified` (vendedor confirma
manualmente após contato ao vivo) foi conectado: os outros dois (`lead-calendar-reply`,
`lead-scheduling-link-click`) dependem de um transporte que não existe neste produto (parser de
réplica de calendário por e-mail; página de agendamento self-service) — fora de escopo desta
rodada, documentado no audit doc.

## O que foi construído

- **`src/features/cadence/application/scheduleMeeting.ts`** (novo) — orquestração pura:
  `scheduleVerifiedMeeting(ports, input, now)`. Pré-checa `isVerifiableConfirmation` com uma
  referência qualquer antes de criar qualquer `Note` (mesmo raciocínio de
  `dealClosureGate.ts::ensureManualDealClosureAllowed` — nunca deixa uma nota de "reunião
  confirmada" falsa no histórico quando o horário não é verificável), cria a nota real, e só então
  chama `scheduleMeetingIfConfirmed` do domínio com o id da nota como evidência.
- **`src/features/cadence/infra/PrismaMeetingConfirmationNotePort.ts`** (novo) — grava a `Note`
  real no lead (mesmo padrão de `PrismaDealClosureGate.createConfirmationNote`).
- **`src/features/cadence/infra/PrismaCalendarSchedulerPort.ts`** (novo) — implementação real de
  `CalendarSchedulerPort`. Stub de transporte: devolve um `googleEventId` sintético
  (`stub-google-event-<uuid>`, logado como tal, comentário explicando exatamente o que a
  implementação real faria) e grava o `CadenceCalendarEvent` real, vinculando o `CadenceRun` ativo
  do lead quando existe (`status: 'Active'`).
- **`POST /api/cadence/leads/:leadId/schedule-meeting`** (`cadence.routes.ts`) — mesmo padrão de
  autenticação/tenant/roles das outras rotas de escrita do arquivo (`writeRoles`, RLS via
  `req.user.organizationId`). Resolve o lead (título, e-mail do contato) dentro do tenant, chama a
  orquestração, devolve 201 com o resultado ou 422 quando a confirmação não é verificável.
- `docs/openapi.yaml` — nova entrada `POST /cadence/leads/{leadId}/schedule-meeting`.
- `docs/CADENCE-CYCLE-AUDIT.md` — nota "Atualização — Onda 27", seção CYC-004 reescrita, linha da
  tabela-resumo atualizada, `CadenceCalendarEvent` removida da lista de tabelas mortas.

## Fora de escopo (documentado, não corrigido)

- Chamada real ao Google Calendar (decisão de produto: stub nesta rodada).
- Os outros 2 tipos de evidência do domínio (réplica de calendário por e-mail, link de agendamento
  self-service).
- Freebusy antes de propor um horário.
- Cancelamento/reagendamento de um `CadenceCalendarEvent` já criado.

## Gate

- `npx prisma generate` / `npx tsc --noEmit` — limpos
- `npm run lint` — 0 erros, 89 warnings (baseline herdado do hotfix da onda anterior — nenhum
  warning novo introduzido por este item)
- unit: `npx vitest run -c vitest.unit.config.ts` — **182/182 arquivos, 1420/1420 testes**
- integration (Postgres+Redis reais): `npx dotenv-cli -e .env.test -- npx vitest run -c
  vitest.integration.config.ts` — **40/40 arquivos, 188/188 testes**, incluindo os 8 casos novos de
  `tests/integration/cadence-schedule-meeting.routes.test.ts` (confirmação válida cria Note +
  CadenceCalendarEvent reais; lead sem e-mail de contato não bloqueia; vincula CadenceRun ativo
  quando existe; 422 sem persistir nada quando o horário é inválido; 400 de payload malformado;
  404 lead inexistente; RLS entre organizações; 403 sem papel de escrita)
- `npm run build` e `npm run build:worker` — ambos limpos

## Skips e flakes

0 — nenhum teste pulado ou instável observado nesta rodada.

## Achado adicional (fora do escopo de código, registrado para transparência)

Durante a sincronização de `main` após o merge do hotfix da onda anterior, foi descoberto que o
dono do repositório havia empurrado commits diretos para `main` em paralelo (`b9ce25b`/`8dafb92`),
resolvendo o mesmo bug de schema duplicado de forma independente e mantendo suas próprias versões
de 3 arquivos do módulo Account Intelligence ao mesclar o hotfix — reintroduzindo
`actionExecutor.service.ts` e `newsMonitor.worker.ts` (código órfão, dados mock, não montado em
lugar nenhum) e uma versão mais completa de `accountIntelligence.service.ts` (857 linhas, real,
sem red flags). Gate completo rodado contra o `main` resultante confirmou CI saudável (tsc/lint
limpos, build+build:worker limpos, 179/1411 unit e 39/180 integration antes deste item) — nenhuma
ação corretiva foi necessária, e o código órfão não foi revertido de novo por ser trabalho paralelo
do dono do repositório na mesma área, sem efeito em produção.
