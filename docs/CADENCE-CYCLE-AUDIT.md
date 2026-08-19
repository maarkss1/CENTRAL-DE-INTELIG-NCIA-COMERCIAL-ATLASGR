# Auditoria — Cadência multicanal e ciclo de receita (CYC-001..009)

Sprint 06 / Onda 18. Auditoria real (5 investigações paralelas independentes, cada uma lendo o
código-fonte diretamente) do estado atual de cada entrega do roadmap
`SPRINT-06-CADENCIA-CICLO-RECEITA.md` contra o que existe implementado e conectado em produção.

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
- `src/features/cadence/domain/replyTracking.ts` — porta pronta para reply tracking de e-mail;
  sem transporte de e-mail de entrada (IMAP/webhook) para alimentá-la.
- `src/features/cadence/domain/scheduling.ts` — guardrails anti-inferência-de-IA para agendamento
  bem desenhados e testados; sem `CalendarSchedulerPort` real (não existe criação de evento no
  Google Calendar em lugar nenhum do código, só leitura via OAuth).
- `src/features/cadence/domain/proposal.ts` (versionamento de proposta) — funções puras testadas;
  `CrmCommercialDocumentVersion` nunca é lido/escrito.
- `src/features/cadence/domain/dealClosure.ts` (evento verificável de fechamento) — bem desenhado
  contra "texto de IA nunca fecha negócio"; nunca chamado por `LeadUseCases.updateLeadStatus`.
- `CrmDocumentSignatureRequest` (assinatura eletrônica) — só schema; zero linha de integração com
  qualquer provedor (gov.br foi a decisão de produto documentada, mas nada foi implementado).
- Tabelas mortas confirmadas (schema existe, zero leitura/escrita em código): `EmailMessage`,
  `CadenceCalendarEvent`, `CrmCommercialDocumentVersion`, `CrmDocumentSignatureRequest`,
  `DealClosureEvent`.

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

**Estado: 3 dos 5 estados do roadmap implementados; lógica de domínio correta e testada, mas sem
runtime.**

- `CadenceRunStatus` tem só `active | paused | stopped`. `completed` está representado como
  `stopReason`, não como estado; `failed` não existe em nível de run (só por touch individual).
- 4 dos 5 motivos de parada existem (`opt-out`, `lead-reply`, `manual-stop`, `completed`); falta
  `policy/guardrail` como motivo dedicado. O motivo é rastreado explicitamente e nunca sobrescrito
  uma vez setado (proteção real contra perda de causa raiz).
- Campos do touch: canal e horário completos; número de tentativa é reconstituível mas não é um
  campo próprio; `result` cobre só "aceito pelo provedor" (não entrega/leitura); `error` não passa
  por nenhuma sanitização de código (só convenção em comentário); `providerMessageId` existe na
  coluna mas nunca é escrito (correlation id "morto").
- Nenhum destes gaps foi corrigido nesta rodada — são decisões de modelagem que exigiriam migration
  e mudança de contrato, mais apropriadas para quando o runtime for construído de fato.

## CYC-003 — Reply tracking de e-mail

**Estado: inexistente em produção.** Só a "porta" de domínio (`replyTracking.ts`) e o schema
(`EmailMessage`) existem, ambos órfãos — sem IMAP/webhook de entrada, sem persistência, sem
`ConversationSignal` de canal `email` gravado. O padrão de referência (WhatsApp) está implementado
e conectado ponta a ponta, exceto o passo "encerra/pausa cadência", que não está ligado à máquina
de estados formal para nenhum canal — hoje só reage a opt-out explícito.

## CYC-004 — Agendamento Google

**Estado: inexistente em produção.** A integração Google real é hoje só OAuth + leitura
(`getUpcomingCalendarEvents`). Não há criação de evento, não há freebusy, não há
`CalendarSchedulerPort` real. O domínio `scheduling.ts` tem guardrails muito bem desenhados e
testados contra confirmação inferida por LLM (`FORBIDDEN_EVIDENCE_MARKERS`,
`isVerifiableConfirmation`) — o requisito "LLM inferindo não é confirmação" é respeitado por
construção, mas nunca é exercitado em produção porque a funcionalidade que ele guardaria não
existe. `CadenceCalendarEvent` é tabela morta.

## CYC-005 — Proposta versionada

**Estado: CRUD básico real existe (`CrmCommercialDocument`, `/api/crm/documents`); versionamento e
rastreamento real de "visualizado" não existem.**

- Máquina de estados nominal (`Rascunho→Enviado→Visualizado→Aceito/Recusado/Vencido/Pago/Cancelado`)
  cobre os nomes do roadmap, mas a transição é um `PUT` sem validação de transição nem Zod, 100%
  manual. `publicToken` (pensado para link público de visualização) nunca é lido em lugar nenhum —
  não existe rastreamento real de "visualizado".
- `CrmCommercialDocumentVersion` e a lógica de domínio (`proposal.ts`) existem, mas nada os
  conecta — hoje, editar um documento sobrescreve o registro sem preservar histórico.
- Os 6 templates HTML estáticos em `public/tools/propostas/` são um gerador client-side totalmente
  desconectado do backend (sem `fetch`, sem persistência). O catálogo `CrmProduct`/`CrmDealItem` é
  o "modelo comercial reutilizável" mais próximo do que o roadmap pede.

## CYC-006 — Assinatura eletrônica

**Estado: inexistente em código.** Só o model `CrmDocumentSignatureRequest` + decisão de produto
documentada (provedor gov.br, escolhido por ser oficial e gratuito) em comentário de schema e
handoff. `provider` foi modelado como texto livre de propósito, para não travar em um enum —
decisão saudável para quando a integração for construída, mas hoje não há nenhuma linha de
integração real com nenhum provedor.

## CYC-007 — Fechamento determinístico

**Estado: nenhuma violação ativa; gate de evidência desenhado mas não conectado.**

- Confirmado por leitura de código (não só teste): a única ferramenta de IA que escreve
  `Lead.status` (`updateLeadQualificationTool`) tem o enum Zod restrito a 4 valores que **não**
  incluem `Negocios_Ganhos`. Nenhuma automação (`AutomationActionLabel`, 3 valores) toca status.
  Teste dedicado (`closer.no-win-path.test.ts`) prova isso por código-fonte.
- O único caminho de escrita real é 100% humano: drag-and-drop no Kanban, autenticado por RBAC
  (`ADMIN|GESTOR|CLOSER|SDR`), via `LeadUseCases.updateLeadStatus`.
- **Gap real**: `dealClosure.ts` (`isDeterministicCloseEvent`, que exigiria evidência de aceite/
  assinatura/pagamento) existe e está bem desenhado, mas `updateLeadStatus` não o chama — qualquer
  humano com role de escrita move para "Negócios Ganhos" hoje sem nenhuma evidência anexada. Não
  corrigido nesta rodada: conectar esse gate mudaria o fluxo de fechamento manual que funciona hoje
  em produção (bloquearia fechamentos sem evidência estruturada) — é uma decisão de produto, não
  uma correção pontual de baixo risco.

## CYC-008 — Runtime/idempotência

**Estado: o runtime que este item audita não existe ainda.** Boa notícia: nada envia mensagem
duplicada hoje pelo módulo novo, porque nada o executa. Má notícia: o código de
`advanceCadenceRun` já tem uma falha de concorrência real — despacha (`dispatcher.dispatch`) antes
de qualquer checagem/gravação, sem lock distribuído nem constraint único em
`CadenceTouchAttempt`. No dia em que um worker for plugado nele, um retry do BullMQ duplicaria o
envio real ao lead antes mesmo de qualquer gravação acontecer. Não corrigido nesta rodada (não há
runtime para testar a correção contra), mas registrado como bloqueador para quando o worker for
construído.

## CYC-009 — UI de cadência

**Estado: rota real, no menu principal, mas somente leitura.** `/app/cadence` existe e está na
Sidebar (não é deep-link escondido). Mostra 3 estados de run (não 5 — mesmo gap do CYC-002,
refletido na UI). Não há botão de criar/pausar/retomar/parar — a própria tela avisa isso ao
usuário. Sem teste E2E (Playwright) e sem cobertura em `accessibility.spec.ts`.

## Resumo por item

| Item | Corrigido nesta sprint | Estado real |
|---|---|---|
| CYC-001 Opt-out | Sim — gap de enforcement no WhatsApp manual | Maioria implementada e enforced; unificação parcial |
| CYC-002 Máquina de estados | Não | 3/5 estados, 4/5 motivos; sem runtime |
| CYC-003 Reply tracking e-mail | Não | Só domínio/schema órfãos |
| CYC-004 Agendamento Google | Não | Só OAuth+leitura; sem criação de evento |
| CYC-005 Proposta versionada | Não | CRUD básico real; versionamento/tracking órfãos |
| CYC-006 Assinatura eletrônica | Não | Só schema + decisão de produto documentada |
| CYC-007 Fechamento determinístico | Não | Sem violação ativa; gate de evidência não conectado |
| CYC-008 Runtime/idempotência | Não | Runtime inexistente; falha de concorrência latente no código pronto |
| CYC-009 UI | Não | Rota real e no menu; somente leitura, sem E2E/a11y |
