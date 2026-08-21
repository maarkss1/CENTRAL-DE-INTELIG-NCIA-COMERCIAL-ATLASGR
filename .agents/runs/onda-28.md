# Onda 28 — CYC-006: assinatura eletrônica (stub gov.br)

## Contexto

Item 7/15 da rodada "resolver todas as pendências" (`docs/CADENCE-CYCLE-AUDIT.md` /
`docs/AI-SWARM-GOVERNANCE-AUDIT.md`, Sprint 06/07). Segue diretamente o merge de CYC-004 (PR #199).

**Estado de entrada (auditoria)**: `CrmDocumentSignatureRequest` — só schema + decisão de produto
documentada em comentário (provedor gov.br, `provider` texto livre de propósito). Zero linha de
domínio, aplicação ou integração real. Diferente de CYC-004 (que já tinha `scheduling.ts` pronto),
este item não tinha nenhum domínio pré-existente — precisou ser desenhado do zero.

## Decisão de produto

Mesma decisão já confirmada nesta rodada para integrações que dependem de credencial externa ainda
não disponível (Google Calendar, e-mail inbound, gov.br e-signature — os 3 itens nomeados
explicitamente na decisão original): **construir a arquitetura completa com um stub da chamada
externa**, pronta para plugar a credencial real depois.

Aqui, diferente de CYC-004 (onde a OAuth já funcionava para leitura), não há infraestrutura de
integração alguma com o gov.br — nem leitura, nem escrita, nem credencial de integrador. Por isso
o stub é mais simples de justificar: `GovBrSignatureProviderPort.sendForSignature` devolve um
`providerRequestId` sintético e loga como tal. Tudo em volta — criação da solicitação, guardrail de
transição de status, webhook de entrada real — é real e testado contra Postgres.

## O que foi construído

- **`src/features/cadence/domain/signature.ts`** (novo) — domínio puro: `isValidSignatureTransition`
  é o guardrail central, decide se uma transição de status vinda de um webhook é aceitável dado o
  estado atual. Nunca sai de um estado terminal (`signed`/`declined`/`expired`/`cancelled`), nunca
  pula etapa que o fluxo real não anuncia (`created → signed` direto é rejeitado). Protege contra
  webhook fora de ordem ou reentregue — risco real de qualquer integração por webhook.
- **`src/features/cadence/application/documentSignature.ts`** (novo) — `requestDocumentSignature`
  (cria a solicitação, chama o provedor, grava `providerRequestId`) e `applySignatureStatusUpdate`
  (resolve a solicitação, valida a transição, aplica ou ignora silenciosamente — nunca lança em
  cima de um evento inválido).
- **`src/features/cadence/infra/PrismaSignatureRequestRepository.ts`** (novo) — implementação real
  do repositório. `findByProviderRequestId` roda com bypass de RLS controlado (mesmo modelo de
  confiança de `recordDocumentView`/`publicToken`: o `providerRequestId` é opaco, gerado por nós,
  não adivinhável) — sem tenant conhecido a priori no webhook, igual ao problema que CYC-003
  resolveu para e-mail. `updateStatus` roda escopado pelo `organizationId` já resolvido por esse
  lookup, nunca por um valor solto do payload do webhook. `CrmDocumentSignatureRequest` adicionado
  a `BYPASS_RLS_ALLOWED_MODELS` (`src/lib/prisma.ts`).
- **`src/features/cadence/infra/GovBrSignatureProviderPort.ts`** (novo) — stub de transporte
  (envio real ao gov.br).
- **`POST /api/crm/documents/:id/request-signature`** (`crm360.routes.ts`, mesmo padrão DI de
  `createDocument`/`updateDocumentContent`) — resolve `signerEmail`/`signerName` do `Contact`
  vinculado ao documento quando ausentes no body; 422 quando não há e-mail de nenhuma fonte.
- **`POST /api/webhooks/signature/webhook`** (`signatureStatus.webhook.ts`, novo) — mesmo esquema
  de `emailReply.webhook.ts`: corpo cru, HMAC fail-closed via `SIGNATURE_INBOUND_WEBHOOK_SECRET`
  (novo, `env.ts`/`.env.example`), idempotente/seguro contra reentrega via o guardrail do domínio.
  Nunca 5xx em `not-found`/`invalid-transition` (reentregar não mudaria o resultado).

## Fora de escopo (documentado, não corrigido)

- Envio real ao provedor gov.br (decisão de produto: stub nesta rodada).
- Conectar `signature_completed` ao `dealClosureGate.ts` (CYC-007) para fechar o negócio
  automaticamente ao receber `signed` — decisão de produto própria, mesmo peso da decisão já
  tomada no CYC-007 de não bloquear o fechamento manual por falta de evidência.

## Gate

- `npx tsc --noEmit` — limpo
- `npm run lint` — 0 erros, 89 warnings (baseline herdado, nenhum novo)
- unit: `npx vitest run -c vitest.unit.config.ts` — **187/187 arquivos, 1457/1457 testes**
- integration (Postgres+Redis reais): `npx dotenv-cli -e .env.test -- npx vitest run -c
  vitest.integration.config.ts` — **41/41 arquivos, 197/197 testes**, incluindo os 9 casos novos de
  `tests/integration/document-signature.routes.test.ts` (solicitação real com e-mail do contato;
  signerEmail explícito sobrescreve; 422 sem contato/signerEmail; 404 documento inexistente; 400
  e-mail inválido; 403 sem papel de escrita; fluxo completo created→sent→viewed→signed aplicado e
  persistido; webhook atrasado depois de Signed ignorado sem reverter; providerRequestId
  desconhecido ignorado sem 500)
- `npm run build` e `npm run build:worker` — ambos limpos

## Correção durante a implementação

Primeira versão do webhook falhava com "not-found" mesmo para solicitações reais: o lookup por
`providerRequestId` rodava sem contexto de tenant (RLS bloqueava silenciosamente). Corrigido com o
mesmo padrão de `recordDocumentView`: bypass de RLS controlado só no lookup pelo id opaco, escrita
real escopada pelo `organizationId` resolvido por esse lookup.

## Skips e flakes

0 — nenhum teste pulado ou instável observado nesta rodada.
