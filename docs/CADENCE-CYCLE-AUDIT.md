# Auditoria — Cadência multicanal e ciclo de receita (CYC-001..009)

Sprint 06 / Onda 18. Auditoria real (5 investigações paralelas independentes, cada uma lendo o
código-fonte diretamente) do estado atual de cada entrega do roadmap
`SPRINT-06-CADENCIA-CICLO-RECEITA.md` contra o que existe implementado e conectado em produção.

> **Atualização — Sprint 07 / Onda 19**: CYC-008 (runtime/idempotência) saiu de "inexistente" para
> "construído e verificado contra Postgres/Redis reais". Ver seção CYC-008 abaixo para o estado
> atual; o restante deste documento (CYC-002 a CYC-007, CYC-009) permanece como estava na Onda 18 —
> ainda não revisitado.
>
> **Atualização — Onda 22**: a onda-22 resolveu duas pendências. Primeiro, a rota/UI para criar
> `CadenceSequence` e iniciar `CadenceRun` (pré-requisito para o runtime da onda-19 ter efeito
> prático — ver `.agents/runs/onda-22.md`). Segundo, CYC-002 (máquina de estados) saiu de "3 dos 5
> estados" para os 5 estados/5 motivos completos do roadmap, com `attemptNumber` e sanitização de
> erro por toque — ver seção CYC-002 abaixo para o estado atual. CYC-003 a CYC-007 e CYC-009
> permanecem como estavam na Onda 18 — ainda não revisitados (seguem em PRs separados desta mesma
> rodada).
>
> **Atualização — Onda 24**: CYC-007 (fechamento determinístico) conectado — ver seção CYC-007
> abaixo. Decisão de produto confirmada com o usuário: o gate não bloqueia o fluxo humano de
> fechamento manual que já funciona em produção (bloquear exigiria CYC-005/CYC-006, que ainda não
> têm integração real de provedor); em vez disso, a confirmação humana pelo CRM É a evidência
> (`manual_crm_confirmation`), e o que o gate garante de verdade é que nenhum fechamento
> automatizado passa por nenhum dos 3 caminhos de escrita. CYC-003, CYC-004, CYC-005, CYC-006 e
> CYC-009 permanecem como estavam na Onda 18 — ainda não revisitados (seguem em PRs separados).
>
> **Atualização — Onda 25**: CYC-005 (proposta versionada) conectado — ver seção CYC-005 abaixo.
> `CrmCommercialDocumentVersion` sai da lista de tabelas mortas: criar ou editar um documento agora
> grava uma versão real (nunca sobrescreve o histórico), e `publicToken` passou a ser lido de
> verdade por uma rota pública nova (`GET /api/public/proposals/:token/view`) que registra
> visualização real e avança `Enviado → Visualizado` na primeira abertura do link. CYC-003, CYC-004,
> CYC-006 e CYC-009 permanecem como estavam na Onda 18 — ainda não revisitados (seguem em PRs
> separados).
>
> **Atualização — Onda 26**: CYC-003 (reply tracking de e-mail) conectado — ver seção CYC-003
> abaixo. Decisão de produto confirmada com o usuário: construir a arquitetura completa (webhook de
> entrada real, idempotência, filtro de auto-resposta/bounce, classificação de intenção,
> `ConversationSignal`/timeline reais) com um **stub de transporte** — nenhum provedor real de
> inbound-parse de e-mail (SendGrid/Postmark/Mailgun) está plugado ainda, porque este projeto não
> tem hoje uma caixa de e-mail dedicada por organização (`SMTP_*` é uma conta compartilhada). O
> endpoint (`POST /api/webhooks/email/webhook`) aceita o payload que um provedor real entregaria
> depois de resolver `organizationId` — plugar o provedor real depois é só apontar o webhook dele
> para cá. `EmailMessage` sai da lista de tabelas mortas. `hasLeadReplied` (o sinal real que
> `advanceCadenceRun` usa para parar a cadência) passou a enxergar réplica de e-mail além de
> WhatsApp. CYC-004, CYC-006 e CYC-009 permanecem como estavam na Onda 18 — ainda não revisitados
> (seguem em PRs separados).
>
> **Atualização — Onda 27**: CYC-004 (agendamento Google) conectado — ver seção CYC-004 abaixo. Dos
> 3 tipos de evidência que `scheduling.ts` aceita, só `manual-verified` (vendedor confirma
> manualmente após contato ao vivo) tem um caminho de escrita real agora — os outros dois (réplica
> de calendário por e-mail, clique em link de agendamento self-service) exigem um transporte que
> ainda não existe neste produto, mesmo raciocínio de CYC-003/CYC-006. `POST
> /api/cadence/leads/:leadId/schedule-meeting` cria uma `Note` real de evidência (mesmo padrão de
> `dealClosureGate.ts` — confirmação manual "ainda exige nota, não é confiança geral") e um
> `CadenceCalendarEvent` real. **Decisão de produto confirmada com o usuário**: a criação do evento
> no Google Calendar em si é um **stub de transporte** — a integração OAuth real já existe e
> funciona para leitura (`google.service.ts::getUpcomingCalendarEvents`), mas o escopo hoje
> conectado é só `calendar.readonly`; escrever eventos exigiria pedir `calendar.events` e forçar
> reconsentimento de toda organização já conectada, uma mudança de produto real fora do escopo
> desta rodada. `CadenceCalendarEvent` sai da lista de tabelas mortas confirmadas. CYC-006 e CYC-009
> permanecem como estavam na Onda 18 — ainda não revisitados (seguem em PRs separados).
>
> **Atualização — Onda 28**: CYC-006 (assinatura eletrônica) conectado — ver seção CYC-006 abaixo.
> `POST /api/crm/documents/:id/request-signature` cria uma solicitação real (provedor `'govbr'`,
> stub de transporte — mesma categoria de CYC-003/CYC-004: nenhuma credencial de integrador gov.br
> configurada) e `POST /api/webhooks/signature/webhook` aplica atualizações de status reais vindas
> do provedor, com um guardrail novo (`isValidSignatureTransition`, domínio puro testado) que
> nunca reverte um estado terminal já aplicado (proteção real contra webhook fora de ordem ou
> reentregue). `CrmDocumentSignatureRequest` sai da lista de tabelas mortas confirmadas. CYC-009
> permanece como estava na Onda 18 — ainda não revisitado.
>
> **Atualização — Onda 29**: CYC-009 (UI de cadência) conectado — ver seção CYC-009 abaixo. Único
> gap real que restava: pausar/retomar/parar um run em andamento não tinha rota nenhuma
> (`pauseCadenceRun`/`resumeCadenceRun`/`stopCadenceManually` já existiam prontos e testados no
> domínio desde uma sprint anterior). `POST /api/cadence/runs/:id/pause|resume|stop` conectados,
> com ações reais na UI (parar exige confirmação — é irreversível). Cobertura E2E
> (`tests/e2e/cadence.spec.ts`) e de acessibilidade (`accessibility.spec.ts`) adicionadas — a tela
> nunca tinha nenhuma das duas. Esta é a última entrega pendente do bloco CYC-001..009.
>
> **Atualização — Onda 3 "Integrações honestas"**: CYC-004 deixou de ser stub de transporte. O
> commit `608ab09` (`fix(qa): resolve P3 debts...`) mudou o escopo OAuth de `calendar.readonly`
> para `calendar.events` e ligou `PrismaCalendarSchedulerPort.createEvent` à chamada real
> (`google.service.ts::createCalendarEvent`, `POST
> https://www.googleapis.com/calendar/v3/calendars/primary/events`) — a reconexão de escopo que a
> nota da Onda 27 descrevia como decisão de produto pendente já aconteceu. Ver seção CYC-004
> abaixo para o estado atual; esta rodada só atualizou a documentação e a tela de Integrações
> (`Integrations.tsx`) para pararem de descrever a escrita como pendente — não houve mudança de
> comportamento de integração nesta rodada.
>
> Nota à parte, sem relação com CYC-004: o CI desta mesma rodada revelou `tests/unit/features/
> automation-sdr-voz.test.ts` dependendo do horário real de execução (`isWithinCallWindow(new
> Date(), ...)`, expediente comercial em horário de Brasília, nunca mockado no teste) — fora do
> expediente (18h+ ou fim de semana em BRT) a suíte inteira falhava de forma intermitente,
> reproduzido também em `origin/main` e não causado por esta rodada. Corrigido no mesmo PR
> (mock de `coldCall.policy`/`coldCall.service`) por ser a causa raiz do CI vermelho encontrado
> aqui, não por fazer parte do escopo de CYC-004.

## Achado estrutural que atravessa quase toda a sprint

Existe um padrão consistente em praticamente todos os 9 itens: **schema Prisma bem desenhado +
domínio TypeScript puro e testado unitariamente + zero ligação a um transporte/worker/rota real**.
Isso não é uma lista de bugs pontuais — é uma "Leva A" (contratos) que já foi entregue com
qualidade real, aguardando uma "Leva B" (runtime e produto) que ainda não aconteceu. O próprio
roadmap já previa essa ordem ("Leva A — contratos antes de implementação" / "Leva B — runtime e
produto, depois dos contratos").

Concretamente, os seguintes módulos existem como domínio testado mas **sem nenhum caller de
produção**:
- `src/features/cadence/application/cadenceService.ts` (`advanceCadenceRun`) — ninguém o chama
  fora de testes; não há worker BullMQ, fila ou cron para cadência.
- ~~`src/features/cadence/domain/replyTracking.ts` — porta pronta para reply tracking de e-mail;
  sem transporte de e-mail de entrada (IMAP/webhook) para alimentá-la.~~ Conectado na Onda 26 (ver
  CYC-003) com um stub de transporte real (`emailReply.webhook.ts`).
- ~~`src/features/cadence/domain/scheduling.ts` — guardrails anti-inferência-de-IA para agendamento
  bem desenhados e testados; sem `CalendarSchedulerPort` real (não existe criação de evento no
  Google Calendar em lugar nenhum do código, só leitura via OAuth).~~ Conectado na Onda 27 (ver
  CYC-004) — inicialmente com stub de transporte, escrita real ligada desde o commit `608ab09`
  (ver nota "Onda 3" acima).
- `src/features/cadence/domain/proposal.ts` (versionamento de proposta) — funções puras testadas;
  `CrmCommercialDocumentVersion` nunca é lido/escrito.
- `src/features/cadence/domain/dealClosure.ts` (evento verificável de fechamento) — bem desenhado
  contra "texto de IA nunca fecha negócio"; nunca chamado por `LeadUseCases.updateLeadStatus`.
- ~~`CrmDocumentSignatureRequest` (assinatura eletrônica) — só schema; zero linha de integração com
  qualquer provedor.~~ Conectado na Onda 28 (ver CYC-006) com um stub de transporte real (provedor
  `'govbr'`, envio da solicitação é stub, webhook de status de entrada é real).
- Tabelas mortas confirmadas (schema existe, zero leitura/escrita em código): nenhuma restante
  desta lista original. `EmailMessage` saiu na Onda 26 (CYC-003); `CrmCommercialDocumentVersion`
  saiu na Onda 25 (CYC-005); `DealClosureEvent` saiu na Onda 24 (CYC-007); `CadenceCalendarEvent`
  saiu na Onda 27 (CYC-004); `CrmDocumentSignatureRequest` saiu na Onda 28 (CYC-006).

O que **está** ativo em produção hoje, cobrindo parcialmente o mesmo território, é um sistema
legado paralelo que não conhece nada do módulo novo: `src/features/crm/jobs/followUp.worker.ts`
(follow-up automático de WhatsApp) varre leads diretamente, sem usar `CadenceRun`/`CadenceSequence`
nem o opt-out unificado (`OptOutRecord`) — consulta só o campo solto `customFields.optOutWhatsApp`.

## CYC-001 — Opt-out unificado

**Estado: parcialmente implementado e majoritariamente enforced, com um gap real corrigido nesta
sprint.**

- Já existe um model unificado `OptOutRecord` (`OptOutScope: Email|WhatsApp|Voice|Global`),
  isolado por tenant com RLS real, com `originChannel`/`evidence` gravados (nunca inferência de
  IA) — não é "teoria", está em uso real pelos 3 canais.
- **Corrigido nesta sprint**: `POST /api/whatsapp/send` (envio manual pelo painel) passava
  `context: { skipOptOutCheck: true }` sem nenhuma justificativa no código — era a única ocorrência
  desse flag em todo o repositório, e permitia a qualquer usuário autenticado enviar WhatsApp
  manual para um lead que já tinha pedido para não ser mais contatado. A rota agora deixa a
  checagem padrão (`isOptedOut`) rodar como qualquer outro envio. Teste de regressão novo:
  `tests/unit/features/integrations/whatsapp/whatsapp.routes.test.ts`.
- **Pendências não corrigidas nesta rodada** (documentadas para produto/próxima sprint):
  - `CallSuppression` (voz) continua como fonte paralela — não descontinuada, backfill feito mas
    migração de leitura completa (passo 3 mencionado em comentário no próprio código) não ocorreu.
  - `customFields.optOutWhatsApp` é um terceiro registro de estado, fora do schema relacional, sem
    auditoria própria — usado pelo worker legado `followUp.worker.ts`.
  - Não há rota para o time registrar manualmente um opt-out global ou de e-mail (só existe
    `POST /suppressions`, específica de voz).
  - Nenhuma chamada a `AuditService.log` em todo o ciclo de vida do opt-out — rastreabilidade
    depende só de log estruturado, não de trilha de auditoria formal consultável.
  - `requestedBy` existe no schema mas não é preenchido nos caminhos manuais.
  - Sem teste cobrindo o bloqueio de opt-out no e-mail (`cold-email.service.ts`).

## CYC-002 — Máquina de estados da cadência

**Estado (Onda 22): 5 de 5 estados e 5 de 5 motivos do roadmap implementados, com runtime real
conectado desde a onda-19/onda-22.**

- `CadenceRunStatus` agora é `active | paused | stopped | completed | failed` — `completed` é
  estado próprio (fim natural da sequência), não mais só um `stopReason` disfarçado de `stopped`.
  `failed` existe em nível de run: hoje o único gatilho real é `applyPolicyGuardrailFailure`,
  acionado pelo worker (`cadenceRun.worker.ts`) quando a `CadenceSequence` associada a um run ativo
  fica malformada/inacessível entre uma varredura e outra — antes desta correção esse run ficava
  `Active` para sempre, pulado (e re-tentado) silenciosamente a cada tick.
- 5 de 5 motivos de parada existem (`opt-out`, `lead-reply`, `manual-stop`, `completed`,
  `policy-guardrail`). O motivo continua rastreado explicitamente e nunca sobrescrito uma vez
  setado.
- Campos do touch: canal e horário completos; `attemptNumber` agora é coluna própria (1-based,
  por `touchOrder`, não reconstituído por contagem); `result` continua cobrindo só "aceito pelo
  provedor" (não entrega/leitura — fora de escopo desta rodada); `error` passa por sanitização real
  (`sanitizeTouchError` — redige e-mail/CPF/telefone/credencial e trunca em 500 caracteres antes de
  persistir, não é mais só convenção em comentário); `providerMessageId` já vinha sendo escrito
  pelos dispatchers desde a correção anterior a esta rodada (ver `.agents/runs/`).
- Migration `20260819120000_cadence_state_machine_completion` — escrita à mão (não via
  `prisma migrate dev`) pela mesma limitação de shadow database já documentada na Onda 5
  (`.agents/runs/onda-5.md`), aplicada e validada contra Postgres real neste ambiente.
- Gaps que permanecem fora de escopo desta rodada (não fazem parte dos 5 estados/5 motivos do
  roadmap): `result` do touch ainda não distingue "aceito pelo provedor" de confirmação de
  entrega/leitura — exigiria integração de webhook de status por canal, tratado à parte se/quando
  for priorizado.

## CYC-003 — Reply tracking de e-mail

**Estado: conectado com um stub de transporte real (Onda 26).** A "porta" de domínio
(`replyTracking.ts`, `isGenuineLeadReply`/`handleEmailReply`) agora tem um caller de produção real:

- `POST /api/webhooks/email/webhook` (`src/features/integrations/email/emailReply.webhook.ts`) —
  transporte de ENTRADA. Fail-closed (503 sem `EMAIL_INBOUND_WEBHOOK_SECRET`), assinatura HMAC
  sobre o corpo cru (mesmo esquema de `birthVoice.webhook.ts`), idempotente por
  `providerMessageId` (`@@unique([organizationId, providerMessageId])` em `EmailMessage`). É um
  **stub** de propósito (decisão de produto: "construir com stub, plugar depois"): nenhum provedor
  real de inbound-parse (SendGrid/Postmark/Mailgun) está plugado — o endpoint aceita diretamente o
  payload que esse provedor entregaria depois de resolver `organizationId`, já que o projeto não
  tem hoje uma caixa de e-mail dedicada por tenant (`SMTP_*` é uma conta compartilhada). Tudo a
  partir da assinatura — idempotência, filtro de auto-resposta/bounce, classificação, persistência
  — é real, não simulado.
- Auto-resposta/bounce (`isGenuineLeadReply` — assunto tipo "Out of Office"/"Undeliverable", header
  `Auto-Submitted` diferente de `no`) nunca vira `EmailMessage` nem `ConversationSignal` — o próprio
  módulo de domínio documenta que isso não pode virar sinal, e o webhook aplica o filtro antes de
  qualquer escrita.
- Réplica genuína: resolve o lead em aberto por dica direta (`leadId`, quando o provedor já
  souber) ou pelo e-mail do contato dentro da própria organização (mesmo raciocínio de
  `findContactByPhone` do WhatsApp, mas por e-mail — sempre dentro de
  `requestContext.run({ tenantId })`, nunca cross-tenant). Persiste `EmailMessage` (`direction:
  'inbound'`) mesmo quando nenhum lead corresponde (auditoria, `leadId` nulo). Quando há lead,
  classifica a intenção via `emailIntentClassifier` (implementação real de `IntentClassifierPort`,
  mesmo padrão de extração de `conversation-intelligence.service.ts` do WhatsApp) e grava
  `ConversationSignal` com `channel: 'email'` via `prismaConversationSignalPort`, mais um evento de
  timeline.
- `hasLeadReplied` (`src/features/cadence/infra/hasLeadReplied.ts`) — o sinal real que
  `advanceCadenceRun` usa para parar a cadência com o motivo `lead-reply` — passou a checar
  `EmailMessage.direction === 'inbound'` além de `WhatsAppMessage`. Antes desta rodada, uma cadência
  com toques de e-mail que só recebia resposta por e-mail nunca parava sozinha por esta checagem;
  agora para, com a mesma garantia (auto-resposta/bounce nunca conta como réplica).
- `EmailMessage` sai da lista de tabelas mortas confirmadas deste documento.
- Gap que permanece fora de escopo desta rodada: como resolver `organizationId` a partir de uma
  caixa de e-mail real (sem stub) — depende de decisão de produto sobre inbox por tenant vs. tag de
  endereço de resposta, e do provedor de inbound-parse escolhido. O padrão de referência (WhatsApp)
  segue implementado e conectado ponta a ponta.

## CYC-004 — Agendamento Google

**Estado (Onda 27, escrita real ligada em `608ab09`/QA e confirmada na Onda 3 "Integrações
honestas"): confirmação verificável conectada para o caminho `manual-verified`; criação de evento
no Google Calendar é uma chamada real à API, não mais um stub.**

- `POST /api/cadence/leads/:leadId/schedule-meeting` (`cadence.routes.ts`) — vendedor confirma
  manualmente um horário depois de contato ao vivo com o lead. Segue o único portão de decisão do
  domínio (`isVerifiableConfirmation`): rejeita com 422 qualquer horário no passado ou com fim
  antes do início, sem criar nenhum registro. Quando válido, cria uma `Note` real no lead
  (`scheduleMeeting.ts::scheduleVerifiedMeeting` → `PrismaMeetingConfirmationNotePort`) — a mesma
  garantia de `dealClosureGate.ts`: nenhuma "confirmação" fica registrada sem uma evidência
  auditável e visível no histórico do lead — e só então grava o `CadenceCalendarEvent`
  (`PrismaCalendarSchedulerPort`), vinculando o `CadenceRun` ativo do lead quando existe.
- Dos 3 tipos de evidência aceitos pelo domínio (`lead-calendar-reply`, `lead-scheduling-link-click`,
  `manual-verified`), só o último tem transporte real agora — os outros dois dependem de réplica de
  calendário por e-mail (sem parser dedicado) e de uma página de agendamento self-service (não
  existe), nenhum dos dois construído ainda.
- **Escrita real ligada**: o escopo OAuth foi ampliado de `calendar.readonly` para `calendar.events`
  (`google.service.ts` — toda organização reconectada desde então recebe o escopo de escrita; uma
  organização que conectou antes da mudança e nunca reconectou pode não ter o escopo novo, e a
  chamada volta 403 do Google nesse caso — a tela de Integrações expõe isso por organização via
  `hasCalendarWriteScope`, não assume que toda conexão já tem o escopo novo). `PrismaCalendarSchedulerPort.createEvent` chama
  `google.service.ts::createCalendarEvent` (`POST
  https://www.googleapis.com/calendar/v3/calendars/primary/events`) de verdade. Continua best-effort
  e não-bloqueante por design: se a chamada ao Google falhar (rede, 403 de escopo antigo, token
  revogado), o erro é logado e o fluxo segue gravando `CadenceCalendarEvent` com um
  `fallback-event-<uuid>` local — o Google nunca foi, e continua não sendo, a fonte de verdade do
  agendamento comercial (ver comentário do campo `googleEventId` no schema).
- **Histórico (Onda 27, superado pela escrita real acima)**: a chamada real ao Google Calendar era
  um **stub de transporte**, mesma categoria de CYC-003/CYC-006. A integração OAuth já era real e
  funcionava para leitura (`google.service.ts::getUpcomingCalendarEvents`, `getValidAccessToken` +
  `fetchWithTimeout`), mas o escopo então conectado era só `calendar.readonly` — pedir
  `calendar.events` forçaria reconsentimento de toda organização já conectada ao Google, apontado
  então como decisão de produto fora do escopo daquela rodada. O stub devolvia um `googleEventId`
  sintético (`stub-google-event-<uuid>`, logado como tal).
- `CadenceCalendarEvent` sai da lista de tabelas mortas confirmadas deste documento.
- Fora de escopo (documentado, não corrigido): freebusy antes de propor um horário,
  cancelamento/reagendamento de um `CadenceCalendarEvent` já criado, e os 2 outros tipos de
  evidência (`lead-calendar-reply`/`lead-scheduling-link-click`).

## CYC-005 — Proposta versionada

**Estado (Onda 25): versionamento real conectado; rastreamento real de "visualizado" conectado via
rota pública nova.**

- `CrmCommercialDocumentVersion` deixa de ser tabela morta: `createDocument` grava a versão 1 na
  própria criação; a nova rota `PUT /api/crm/documents/:id` (conteúdo, distinta da rota de status
  já existente) cria sempre uma versão nova via `draftNextProposalVersion` — o histórico nunca é
  sobrescrito, provado por teste de integração (3 edições sucessivas → 4 versões, 1..4 sem lacuna).
  `GET /api/crm/documents/:id/versions` lista o histórico, mais recente primeiro.
- `publicToken` passa a ser lido de verdade: `GET /api/public/proposals/:token/view` — rota
  pública, sem `authenticateToken`/`requireTenant` (o `publicToken`, uuid não adivinhável, é a
  credencial, mesmo modelo já usado para `BitrixConnection`) — registra `viewCount`/
  `firstViewedAt`/`lastViewedAt` reais e avança `Enviado → Visualizado` só na primeira visualização
  (reabrir o link depois de `Aceito`/`Recusado`/`Pago` não regride o status real do negócio).
  `sentAt` também passa a ser gravado (na primeira transição para `Enviado`, nunca sobrescrito
  depois).
- Máquina de estados nominal (`Rascunho→Enviado→Visualizado→Aceito/Recusado/Vencido/Pago/Cancelado`)
  continua sem validação formal de transição (ex.: nada impede `PUT /status` mover de `Rascunho`
  direto para `Pago`) — fora de escopo desta rodada, não corrigido.
- Os 6 templates HTML estáticos em `public/tools/propostas/` continuam um gerador client-side
  totalmente desconectado do backend (sem `fetch`, sem persistência) — conectar essa UI (ou
  construir uma nova) ao backend real de versionamento/visualização é trabalho de produto/frontend
  fora do escopo desta rodada (backend-only). O catálogo `CrmProduct`/`CrmDealItem` continua sendo
  o "modelo comercial reutilizável" mais próximo do que o roadmap pede.

## CYC-006 — Assinatura eletrônica

**Estado (Onda 28): solicitação e atualização de status reais conectadas; envio ao provedor gov.br
é um stub de transporte.**

- **Domínio novo** (`src/features/cadence/domain/signature.ts`) — `isValidSignatureTransition`,
  guardrail que decide se uma transição de status vinda de um webhook é aceitável dado o estado
  atual: nunca permite sair de um estado terminal (`signed`/`declined`/`expired`/`cancelled`),
  nunca pula etapa que o fluxo real de assinatura não anuncia (ex.: `created → signed` direto).
  Protege contra o risco real de qualquer webhook externo — entrega fora de ordem ou reentregue.
- **`POST /api/crm/documents/:id/request-signature`** (`crm360.routes.ts`, via
  `Crm360UseCases`/`PrismaCrm360Repository`, mesmo padrão de `createDocument`/
  `updateDocumentContent`) — cria a solicitação real (`CrmDocumentSignatureRequest`, status
  `Created`), resolve `signerEmail`/`signerName` do `Contact` vinculado ao documento quando não
  informados no corpo, e chama o provedor (stub) para obter um `providerRequestId` (status passa
  para `Sent`).
- **`POST /api/webhooks/signature/webhook`** (`signatureStatus.webhook.ts`, mesmo esquema de
  `emailReply.webhook.ts`: HMAC fail-closed via `SIGNATURE_INBOUND_WEBHOOK_SECRET`, corpo cru) —
  aplica a atualização de status real vinda do provedor via `applySignatureStatusUpdate`, que
  resolve a solicitação por `provider`+`providerRequestId` (lookup com bypass de RLS controlado,
  mesmo modelo de confiança de `recordDocumentView`/`publicToken` — o id é opaco e não
  adivinhável) e só aplica quando `isValidSignatureTransition` aprova; caso contrário devolve 200
  com `outcome: ignored`, nunca 5xx (reentregar não mudaria o resultado).
- **Decisão de produto confirmada com o usuário**: o envio real da solicitação ao gov.br
  (`GovBrSignatureProviderPort.ts`) é um **stub de transporte**, mesma categoria de CYC-003/CYC-004
  — nenhuma credencial de integrador gov.br está configurada neste projeto. O stub devolve um
  `providerRequestId` sintético (`stub-govbr-request-<uuid>`, logado como tal); tudo em volta —
  criação da solicitação, guardrail de transição, webhook de status de entrada, persistência real
  — não é simulado: plugar o provedor real depois é só trocar a função de envio por uma chamada
  HTTP real à API do gov.br.
- `provider` continua texto livre no schema (decisão de produto pré-existente, não alterada) —
  `'govbr'` é o único valor usado nesta rodada.
- `CrmDocumentSignatureRequest` sai da lista de tabelas mortas confirmadas.
- Fora de escopo desta rodada (documentado, não corrigido): conectar `signature_completed` ao gate
  de fechamento determinístico (`dealClosureGate.ts`, CYC-007) — o tipo já é aceito pelo domínio
  `dealClosure.ts`, mas fechar automaticamente um negócio ao receber `signed` é uma decisão de
  produto própria (mesmo peso da decisão já tomada no CYC-007 de não bloquear o fechamento manual
  por falta de evidência), fora do escopo desta rodada.

## CYC-007 — Fechamento determinístico

**Estado (Onda 24): gate conectado nos 3 caminhos de escrita reais que movem um Lead para
"Negócios Ganhos".**

- Confirmado por leitura de código (não só teste): a única ferramenta de IA que escreve
  `Lead.status` (`updateLeadQualificationTool`) tem o enum Zod restrito a 4 valores que **não**
  incluem `Negocios_Ganhos`. Nenhuma automação (`AutomationActionLabel`, 3 valores) toca status.
  Teste dedicado (`closer.no-win-path.test.ts`) prova isso por código-fonte.
- Auditoria desta rodada encontrou **3** caminhos de escrita reais, não 1: `LeadUseCases.
  updateLeadStatus` (drag no Kanban), `LeadUseCases.updateLead` (edição completa do lead, quando o
  payload inclui `status`) e `PrismaCrm360Repository.updateLeadStage` (módulo CRM360, quando a
  etapa de destino tem `leadStatus: Negocios_Ganhos`) — os três agora passam pelo gate.
- **Decisão de produto confirmada com o usuário** (não inventada): bloquear o fechamento até existir
  evidência estruturada de assinatura/pagamento (CYC-005/CYC-006) quebraria o fluxo manual que
  funciona hoje em produção, já que essas integrações reais ainda não existem. Em vez disso —
  `dealClosureGate.ts` (`ensureManualDealClosureAllowed`, `src/features/crm/application/`) —
  a confirmação humana pelo próprio CRM é tratada como a evidência: ao mover um lead para "Negócios
  Ganhos", uma `Note` real é criada automaticamente no lead e um `DealClosureEvent`
  (`manual_crm_confirmation`) é gravado referenciando essa nota, com `triggeredBy` = id do usuário
  autenticado. `DealClosureEvent` saiu da lista de "tabelas mortas confirmadas" deste documento.
- O que o gate garante de verdade (o objetivo central do item): `isDeterministicCloseEvent` rejeita
  qualquer `triggeredBy` com cara de IA/automação (`ai-`, `agent-`, `swarm-`, `closer-`, `bot-`) —
  um fechamento automatizado por qualquer um dos 3 caminhos é bloqueado com 403, nunca aceito
  silenciosamente. Prova por teste de integração contra Postgres real
  (`tests/integration/dealClosureGate.test.ts`).
- Fora de escopo desta rodada (documentado, não corrigido): criar um Lead já com
  `status: 'Negócios Ganhos'` via `POST /api/crm/leads` não passa pelo gate — não há fluxo de UI
  real que crie um lead já fechado, e a ordenação (a evidência referenciaria um lead que ainda não
  existe) tornaria a correção desproporcional ao risco real.

## CYC-008 — Runtime/idempotência

**Estado (Sprint 07/onda-19): construído e verificado contra Postgres + Redis reais.** Até a
Onda 18 o runtime que este item audita não existia — nada chamava `advanceCadenceRun` fora de
teste, e a função tinha uma falha de concorrência real (despachava antes de qualquer
checagem/gravação). As duas coisas foram corrigidas nesta rodada:

- **Trava de concorrência real**: `AdvanceCadenceRunDeps` ganhou uma porta `lock:
  CadenceRunLockPort` — `advanceCadenceRun` agora adquire uma trava por `runId` antes de
  ler/decidir/despachar/gravar, e libera no `finally` (mesmo em erro). Implementação de produção
  (`RedisCadenceRunLock.ts`) reusa a trava distribuída já usada por
  `cold-leads-scanner.service.ts`/`stagnation-scanner.service.ts` (`SET NX EX`, fail-closed se o
  Redis estiver configurado mas indisponível). Prova por teste:
  `src/features/cadence/__tests__/advanceCadenceRun.lock.test.ts` — dois ciclos concorrentes para o
  MESMO run, só um chama o dispatcher.
- **Worker/scheduler real**: `src/features/cadence/jobs/cadenceRun.worker.ts` — BullMQ
  `Worker`/`Queue.upsertJobScheduler` (tick a cada 5 min, mesmo padrão de `followUp.worker.ts`),
  registrado em `worker.ts` junto aos demais workers dedicados. Varre `CadenceRun` com
  `status=Active`, resolve a `CadenceSequence` (com validação real do JSON armazenado — sequência
  malformada é pulada e logada, nunca derruba a varredura), e chama `advanceCadenceRun` por run.
- **Dispatchers reais**: `src/features/cadence/infra/dispatchers/CadenceDispatchers.ts` — WhatsApp
  via `sendWhatsAppMessage` (já existente) e e-mail via `sendEmail`/`mailer.ts` (que passou a
  devolver `messageId` real — antes devolvia `void`). `providerMessageId` agora é gravado de
  verdade em `CadenceTouchAttempt` para e-mail (campo que existia na coluna desde sempre, nunca
  escrito); para WhatsApp continua `null` — `sendWhatsAppMessage` não expõe o id da mensagem do
  Baileys hoje, e alterar isso ficou fora do escopo desta rodada (função usada por outros
  callers). Canal de voz falha de forma honesta (`'Canal de voz ainda não tem dispatcher real de
  cadência'`) em vez de fingir envio — não existe integração de voz para cadência (CYC-004 é só
  agendamento, não é isto).
- **Descoberta cross-tenant corrigida (achado novo, não estava mapeado até esta rodada)**:
  `CadenceRun`/`CadenceSequence` têm RLS `FORCE ROW LEVEL SECURITY` — uma leitura sem
  `app.current_tenant_id`/`app.bypass_rls` setados devolve **zero linhas**, sempre, mesmo que
  existam runs ativos de verdade no banco. Um worker que precisa descobrir "quais organizações têm
  CadenceRun ativo agora" *antes* de saber qual tenant escopar não tinha nenhuma forma seria de
  fazer essa pergunta: nem uma leitura sem contexto (RLS nega), nem `bypassRls:true` sem estar na
  allowlist de produção (`BYPASS_RLS_ALLOWED_MODELS` em `src/lib/prisma.ts`, que em produção
  restringe o efeito do bypass a poucos models). Adicionamos `CadenceRun`/`CadenceSequence` a essa
  allowlist (não contêm credencial nem dado pessoal do lead, diferente de `BitrixConnection`, que
  já estava lá) — o bypass cobre só a descoberta inicial; a partir do momento em que o worker sabe
  o `organizationId` de cada run, todo o resto do ciclo roda escopado normalmente por tenant.
  **Suspeita não confirmada nesta rodada**: o mesmo padrão de leitura sem contexto existe em
  `followUp.worker.ts` (`prisma.lead.findMany` sem `requestContext.run`) — se `Lead` tem a mesma
  política `FORCE ROW LEVEL SECURITY` (tem, ver `20260722020322_enable_rls/migration.sql`), esse
  worker já em produção pode estar processando sempre 0 leads. Não investigado/corrigido aqui (é
  outro worker, outra feature, merece verificação própria) — registrado como risco a checar.
- **Limitação real e deliberada, ainda não resolvida**: não existe nenhuma rota/UI para criar uma
  `CadenceSequence` ou iniciar uma `CadenceRun` (`cadence.routes.ts` é só leitura, ver CYC-009). O
  runtime agora está correto e testado ponta a ponta, mas fica ocioso em produção até essa decisão
  de produto (quem inicia uma cadência, com que sequência/conteúdo) ser tomada — não é algo que um
  worker deva decidir sozinho.

Testes: `src/features/cadence/__tests__/advanceCadenceRun.lock.test.ts` (unit, trava),
`tests/integration/cadenceRun.worker.test.ts` (Postgres + Redis reais — varredura, despacho real
via WhatsApp mockado só no socket Baileys, opt-out, RLS cross-tenant, sequência malformada),
`src/lib/email/__tests__/mailer.test.ts` (messageId real do SMTP).

## CYC-009 — UI de cadência

**Estado (Onda 29): rota real, no menu principal, com CRUD completo de execução (criar sequência,
iniciar, pausar, retomar, parar) — cobertura E2E e de acessibilidade real.** `/app/cadence` existe
e está na Sidebar (não é deep-link escondido). Mostra os 5 estados de run do CYC-002
(`active/paused/stopped/completed/failed`).

- **`POST /api/cadence/runs/:id/pause|resume|stop`** (`cadence.routes.ts`) — o único gap real que
  restava. `pauseCadenceRun`/`resumeCadenceRun`/`stopCadenceManually` já existiam prontos e
  testados no domínio (`domain/cadence.ts`, `__tests__/cadence.test.ts`) desde uma sprint anterior,
  só sem nenhuma rota chamando-os. Cada rota carrega o run pelo id dentro do tenant (RLS real,
  404 se não encontrado/outra organização), aplica a transição (idempotente por construção do
  próprio domínio) e persiste.
- **`CadenceRunActions`** (`CadenceHub.tsx`) — botões reais na linha de cada execução: Pausar/Parar
  quando `active`, Retomar/Parar quando `paused`, nenhuma ação num estado terminal. Parar é
  irreversível (mesmo raciocínio de `stopCadenceManually` — "distinta de pausa: não tem retomada")
  e exige confirmação (`window.confirm`, mesmo padrão já usado em `LeadDetailDrawer.tsx` para
  excluir um lead).
- Nota de escopo da tela ("Em breve nesta tela") corrigida: não afirma mais que
  pausar/retomar/parar "ainda não existe" (passou a existir) nem que reply-tracking/agendamento/
  proposta/assinatura "ainda não têm API própria" (todos ganharam API real nas ondas 26-28) —
  agora documenta com precisão que essas entregas existem, só não têm seção dedicada nesta tela
  ainda.
- **`tests/e2e/cadence.spec.ts`** (novo) — fluxo completo pela UI real (sessão de cookies real via
  signup, sem atalho de seed): cria sequência, inicia run para um lead real, pausa, retoma, para
  com confirmação, e prova que cancelar a confirmação mantém o run ativo. Zero cobertura E2E
  existia antes desta onda.
- **`accessibility.spec.ts`** — nova entrada para `/app/cadence`, zero cobertura de acessibilidade
  automática existia antes desta onda.

Esta é a última entrega pendente do bloco CYC-001..CYC-009 desta rodada.

## Resumo por item

| Item | Corrigido nesta sprint | Estado real |
|---|---|---|
| CYC-001 Opt-out | Sim — gap de enforcement no WhatsApp manual | Maioria implementada e enforced; unificação parcial |
| CYC-002 Máquina de estados | Sim (Onda 22) | 5/5 estados, 5/5 motivos; runtime conectado (worker onda-19/22) |
| CYC-003 Reply tracking e-mail | Sim (Onda 26) | Webhook real (stub de transporte) conectado; `hasLeadReplied` cobre e-mail |
| CYC-004 Agendamento Google | Sim (Onda 27, escrita real desde 2026-08-21) | `manual-verified` conectado (Note + CadenceCalendarEvent reais); criação no Google Calendar é escrita real (`calendar.events`), com fallback local se a chamada falhar |
| CYC-005 Proposta versionada | Sim (Onda 25) | Versionamento real conectado; visualização pública real via publicToken |
| CYC-006 Assinatura eletrônica | Sim (Onda 28) | Solicitação + webhook de status reais; envio ao gov.br é stub de transporte |
| CYC-007 Fechamento determinístico | Sim (Onda 24) | Gate conectado nos 3 caminhos de escrita; evidência humana real, fechamento automatizado bloqueado |
| CYC-008 Runtime/idempotência | Sim (Sprint 07/onda-19) — construído e testado | Worker/scheduler real + trava de concorrência + dispatchers reais; ocioso até existir rota/UI para criar sequência/iniciar run |
| CYC-009 UI | Sim (Onda 29) | CRUD completo (criar/iniciar/pausar/retomar/parar); E2E + a11y reais |

## Reconciliação final CYC — 2026-08-20

A lista antiga que ainda citava **CYC-002/003/004/005/006/007/009** como pendentes foi reconciliada contra a main. Esses itens já estavam implementados e encerrados nas ondas 22 e 24–29; nenhuma reimplementação foi feita nesta rodada para evitar duplicação/regressão. O bloco CYC-001..009 permanece concluído.
