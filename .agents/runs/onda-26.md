# Onda 26 — Item 5/15: CYC-003, reply tracking de e-mail (stub de transporte)

## Identificação
- Origem: `docs/CADENCE-CYCLE-AUDIT.md`, seção CYC-003 — só a "porta" de domínio
  (`replyTracking.ts`) e o schema (`EmailMessage`) existiam, ambos órfãos: sem IMAP/webhook de
  entrada, sem persistência, sem `ConversationSignal` de canal `email` gravado.
- Decisão de produto já confirmada com o usuário (governa CYC-003/004/006): para integrações que
  dependem de credencial externa ainda não disponível (Google Calendar, e-mail de entrada,
  assinatura gov.br), construir a arquitetura completa com um **stub** da chamada externa, pronta
  para plugar credencial real depois — não deixar o item sem nenhum caller de produção.
- SHA de entrada: `main` pós-merge do PR da onda-25 (item 4, CYC-005)
- Branch: `claude/cyc-003-email-reply-tracking`
- Status: **RESOLVIDO** (stub de transporte; provedor real de inbound-parse fora de escopo — ver
  seção "Fora de escopo")

## O que foi construído

### Gap adicional encontrado além do que o audit descrevia
Além de "sem transporte de entrada", a investigação encontrou que mesmo persistir `EmailMessage`
não teria efeito nenhum na cadência: `hasLeadReplied.ts` (o sinal real que `advanceCadenceRun`
usa para decidir `{ type: 'stop', reason: 'lead-reply' }`) só consultava `WhatsAppMessage`. Sem
estender essa checagem, uma cadência com toques de e-mail continuaria nunca parando sozinha por
uma resposta que só chegasse por e-mail — corrigido no mesmo PR (ver abaixo).

### Transporte de entrada (stub) — `POST /api/webhooks/email/webhook`
- `src/features/integrations/email/emailReply.webhook.ts` (novo) — mesmo esquema de
  `birthVoice.webhook.ts`: fail-closed (503 sem `EMAIL_INBOUND_WEBHOOK_SECRET`), assinatura HMAC
  sobre o corpo cru (`express.raw`, montada antes do `express.json()` global), idempotente por
  `providerMessageId` (`@@unique([organizationId, providerMessageId])`, já existente em
  `EmailMessage`).
- É um stub de propósito: nenhum provedor real de inbound-parse (SendGrid/Postmark/Mailgun) está
  plugado — o projeto não tem hoje uma caixa de e-mail dedicada por organização (`SMTP_*` é uma
  conta compartilhada, `src/lib/email/mailer.ts`). O endpoint aceita diretamente o payload
  (`organizationId`, `providerMessageId`, `fromEmail`, `body`, etc.) que um provedor real
  entregaria depois de resolver o tenant — plugar o provedor real depois é só apontar o webhook
  dele para cá com o mesmo payload.
- Auto-resposta/bounce (`isGenuineLeadReply` — assunto "Out of Office"/"Undeliverable"/etc., header
  `Auto-Submitted` diferente de `no`) é filtrado ANTES de qualquer escrita — nunca vira
  `EmailMessage` nem `ConversationSignal`, honrando o próprio comentário do módulo de domínio.
- Resolução de lead: dica direta (`leadId`, para quando o provedor real já souber por tag de
  endereço) ou pelo e-mail do contato dentro da própria organização (mesmo raciocínio de
  `findContactByPhone` do WhatsApp, mas por e-mail — sempre dentro de
  `requestContext.run({ tenantId })`, nunca cross-tenant). Sem lead correspondente, a mensagem
  ainda é persistida (auditoria, `leadId` nulo) mas não classifica nem grava sinal/timeline.
- Réplica genuína com lead resolvido: chama `handleEmailReply` (domínio já existente, sem
  alterações) com o classificador e o port novos abaixo, grava `EmailMessage` (`direction:
  'inbound'`) e um evento de timeline (`type: 'email'`).

### Classificador de intenção — `emailIntentClassifier.ts`
- `src/features/cadence/infra/emailIntentClassifier.ts` (novo) — implementação real de
  `IntentClassifierPort` (porta já definida em `replyTracking.ts`), mesmo padrão de extração
  (prompt/parse/vocabulário permitido) já usado para WhatsApp em
  `conversation-intelligence.service.ts`, mas chamada a partir do transcript de e-mail que
  `handleEmailReply` monta.

### Persistência do sinal — `PrismaConversationSignalPort.ts`
- `src/features/cadence/infra/PrismaConversationSignalPort.ts` (novo) — implementação real de
  `ConversationSignalPort`, grava `ConversationSignal` com `channel: 'email'` (coluna já existia,
  adicionada em antecipação a este item) e um evento de timeline com o resumo extraído.

### `hasLeadReplied` cobre e-mail
- `src/features/cadence/infra/hasLeadReplied.ts` — passou a checar `EmailMessage.direction ===
  'inbound'` além de `WhatsAppMessage`, em paralelo. Como só réplicas genuínas chegam a virar linha
  em `EmailMessage` (filtro aplicado no webhook, antes da escrita), nenhuma checagem extra de
  genuinidade é necessária aqui.

### Documentação
- `docs/openapi.yaml` — nova entrada `POST /webhooks/email/webhook` (tag Webhooks), mesmo nível de
  detalhe da entrada de `voice-result`.
- `src/config/env.ts` / `.env.example` — `EMAIL_INBOUND_WEBHOOK_SECRET` (opcional, fail-closed sem
  ela).

## Correções durante a implementação
- Nenhum bug pré-existente novo descoberto nesta rodada (diferente das ondas 24/25). O bug de
  soft-delete com `select` estreito (`src/lib/prisma.ts`, documentado na onda-25) não foi
  reencontrado porque nenhuma query desta rodada usa `select` estreito em `findUnique(OrThrow)` de
  model auditável.
- `email.leadId` (campo do tipo de domínio `InboundEmailReply`) só é preenchido com o lead
  resolvido IMEDIATAMENTE ANTES de chamar `handleEmailReply` (dentro de `recordInboundEmail`, via
  spread `{ ...email, leadId: lead.id }`) — não antes. `handleEmailReply` usa esse campo para
  `ConversationSignalDraft.leadId`; setá-lo cedo demais (ex. só com a dica opcional do payload)
  gravaria o sinal no lead errado quando a resolução real acontecesse por e-mail do contato em vez
  da dica.

## Fora de escopo desta rodada (documentado, não corrigido)
- **Provedor real de inbound-parse de e-mail**: nenhum IMAP/webhook de SendGrid/Postmark/Mailgun
  real está plugado — decisão explícita do usuário (stub primeiro).
- **Resolução de `organizationId` a partir de uma caixa de e-mail real**: como uma organização vai
  ter uma caixa/endereço de resposta dedicado (ou uma tag por tenant) depende de decisão de produto
  ainda não tomada — o stub aceita `organizationId` explícito no payload por isso.
- **Debounce/fila** (como no WhatsApp, `whatsappSignal.worker.ts`): a classificação roda síncrona
  no próprio request do webhook — réplica de e-mail não tem o padrão de rajada de mensagens do
  WhatsApp que motivou o debounce lá; se isso mudar com um provedor real de alto volume, revisar.

## Gate final
- typecheck: `npx tsc --noEmit` — limpo, 0 erros
- lint: `npm run lint` — 0 erros, 80 warnings (mesmo nível pré-existente do branch base)
- unit: `npx vitest run -c vitest.unit.config.ts` — **175/175 arquivos, 1352/1352 testes**,
  incluindo os 4 arquivos novos: `emailReply.webhook.test.ts` (12 casos: fail-closed, assinatura
  inválida/ausente, JSON inválido, campos obrigatórios, auto-resposta por assunto e por header,
  réplica genuína com dica de leadId, resolução por e-mail do contato, idempotência, lead não
  encontrado), `hasLeadReplied.test.ts` (4 casos), `emailIntentClassifier.test.ts` (3 casos),
  `PrismaConversationSignalPort.test.ts` (4 casos)
- integration: `npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts`
  (Postgres + Redis reais) — **38/38 arquivos, 174/174 testes**, incluindo o novo
  `tests/integration/emailReplyTracking.test.ts` (5 casos: réplica genuína grava
  EmailMessage+ConversationSignal+2 eventos de timeline e `hasLeadReplied` passa a true,
  auto-resposta nunca persiste nem classifica, idempotência por `providerMessageId`, RLS
  cross-tenant com o mesmo e-mail cadastrado em duas organizações, lead não encontrado persiste
  para auditoria sem classificar)
- openapi drift: `openapiRouteInventory.test.ts` — sem deriva (rota nova documentada)
- build: `npm run build` e `npm run build:worker` — ambos limpos
- e2e: não executado (sem UI nova — item é backend/webhook)

## Skips e flakes
0 — nenhum teste pulado ou instável observado nesta rodada.

## Decisão

**Resolvido, como stub de transporte.** `EmailMessage` sai da lista de tabelas mortas: um webhook
real, testado contra Postgres, persiste réplicas genuínas de e-mail, classifica a intenção e grava
`ConversationSignal`/timeline, e `hasLeadReplied` passou a considerar esse canal — uma cadência com
toques de e-mail agora para sozinha quando o lead responde por e-mail, com a mesma garantia que já
existia para WhatsApp (auto-resposta/bounce nunca conta como réplica). O único pedaço
deliberadamente fora desta rodada é a ponta externa real (provedor de inbound-parse) — plugar isso
depois é apontar o webhook do provedor para o endpoint já construído, sem mudar nenhuma lógica de
domínio/persistência.
