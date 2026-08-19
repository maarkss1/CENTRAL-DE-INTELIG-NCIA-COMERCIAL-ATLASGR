# Auditoria — Cadência multicanal e ciclo de receita (CYC-001..009)

Sprint 06 / Onda 18. Auditoria real (5 investigações paralelas independentes, cada uma lendo o
código-fonte diretamente) do estado atual de cada entrega do roadmap
`SPRINT-06-CADENCIA-CICLO-RECEITA.md` contra o que existe implementado e conectado em produção.

> **Atualização — Sprint 07 / Onda 19**: CYC-008 (runtime/idempotência) saiu de "inexistente" para
> "construído e verificado contra Postgres/Redis reais". Ver seção CYC-008 abaixo para o estado
> atual; o restante deste documento (CYC-002 a CYC-007, CYC-009) permanece como estava na Onda 18 —
> ainda não revisitado.

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
| CYC-008 Runtime/idempotência | Sim (Sprint 07/onda-19) — construído e testado | Worker/scheduler real + trava de concorrência + dispatchers reais; ocioso até existir rota/UI para criar sequência/iniciar run |
| CYC-009 UI | Não | Rota real e no menu; somente leitura, sem E2E/a11y |
