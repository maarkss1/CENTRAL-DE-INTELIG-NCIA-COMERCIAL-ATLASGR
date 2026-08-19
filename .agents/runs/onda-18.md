# Onda 18 — Sprint 06: Cadência multicanal e ciclo de receita

## Identificação
- Sprint: 06
- Onda: 18
- SHA de entrada: `62624ec` (main)
- Branch de integração: `claude/sprint-06-cadencia-ciclo-receita`
- Status: **REPROVADA quanto à entrega funcional do roadmap, com 1 correção real de compliance/segurança aplicada**

## Contexto

Esta sprint é diferente das anteriores desta série. Não é uma lista de bugs corrigíveis pontualmente:
é um roadmap de **construção de feature** (jornada completa `lead → cadência → contato → reply →
reunião → proposta → aceite/assinatura → fechamento`), com dependência explícita das Sprints 02 e
05 (ambas já aprovadas). A auditoria (5 investigações paralelas e independentes, cada uma lendo
código-fonte direto) encontrou um padrão consistente em quase todo o roadmap: **schema Prisma bem
desenhado + domínio TypeScript puro e testado unitariamente + zero ligação a runtime real**
(worker, webhook, integração externa). Detalhe completo em
[`docs/CADENCE-CYCLE-AUDIT.md`](../../docs/CADENCE-CYCLE-AUDIT.md).

Isso significa que a "Leva A — contratos antes de implementação" do próprio roadmap já foi
entregue com qualidade real em uma rodada anterior (schema, domínio, testes de domínio). A "Leva
B — runtime e produto" nunca aconteceu. Construir essa runtime (worker BullMQ de cadência,
integração real de e-mail IMAP/webhook, criação de evento no Google Calendar, integração de
assinatura eletrônica gov.br) é trabalho de várias sprints de implementação de feature nova, não
uma correção de baixo risco que caiba com segurança numa única rodada de auditoria+correção.

## Matriz de propriedade

| Agente | Escopo | Resultado |
|---|---|---|
| Auditoria 1 | CYC-001 (opt-out unificado) | Achado crítico + correção aplicada nesta sprint |
| Auditoria 2 | CYC-002 (máquina de estados) + CYC-008 (idempotência) | Runtime inexistente; achados documentados |
| Auditoria 3 | CYC-003 (reply tracking e-mail) + CYC-004 (agendamento Google) | Domínio órfão; achados documentados |
| Auditoria 4 | CYC-005 (proposta) + CYC-006 (assinatura eletrônica) | Domínio órfão; achados documentados |
| Auditoria 5 | CYC-007 (fechamento determinístico) + CYC-009 (UI) | Sem violação ativa; gap de integração documentado |

## Achado corrigido nesta rodada

### CYC-001 — Bug ativo de compliance no opt-out do WhatsApp

`POST /api/whatsapp/send` (envio manual pelo painel) passava `context: { skipOptOutCheck: true }`
sem nenhuma justificativa no código — confirmado como a **única** ocorrência desse flag em todo o
repositório. Isso permitia a qualquer usuário autenticado (ADMIN/GESTOR/CLOSER/SDR) enviar WhatsApp
manual para um lead que já tinha registrado opt-out (global ou de WhatsApp), violando diretamente o
requisito do roadmap: "consulta obrigatória antes de email, WhatsApp e voz".

**Corrigido**: removida a passagem de `skipOptOutCheck: true` na rota — o envio manual agora passa
pela mesma checagem `isOptedOut` que qualquer outro disparo. A capacidade `skipOptOutCheck` da
função `sendWhatsAppMessage` foi mantida no tipo (pode ter uso legítimo futuro documentado, ex.:
uma resposta automática de confirmação do próprio opt-out), mas não tem mais nenhum caller de
produção.

Testes:
- Novo: `tests/unit/features/integrations/whatsapp/whatsapp.routes.test.ts` (2 casos) — trava a
  regressão, provando que o comando enfileirado pela rota nunca carrega `skipOptOutCheck: true`.
- Atualizados os nomes de 2 testes existentes (`whatsapp.service.test.ts`,
  `whatsapp-optout-gating.test.ts`) que descreviam esse flag como "comportamento esperado do
  painel" — não é mais verdade; agora documentam que é só um contrato de baixo nível da função,
  sem caller real.

## Achados documentados como pendência (não corrigidos — construção de feature, fora do escopo de correção pontual)

Resumo em `docs/CADENCE-CYCLE-AUDIT.md`; motivo do não-tratamento em cada caso:

| Item | Situação real | Por que não construído nesta sprint |
|---|---|---|
| CYC-002 Máquina de estados | 3/5 estados (`completed`/`failed` não são estados de run); falta motivo `policy/guardrail`; `providerMessageId` nunca escrito | Exige migration de schema + mudança de contrato do domínio já testado — decisão de modelagem, não bug |
| CYC-003 Reply tracking e-mail | Só domínio (`replyTracking.ts`) e schema (`EmailMessage`) órfãos; zero transporte real | Construir IMAP/webhook de e-mail é feature nova completa |
| CYC-004 Agendamento Google | Só OAuth+leitura; zero criação de evento/freebusy; `CadenceCalendarEvent` é tabela morta | Construir `CalendarSchedulerPort` real é feature nova completa |
| CYC-005 Proposta versionada | CRUD básico real existe; versionamento (`CrmCommercialDocumentVersion`) e tracking de "visualizado" (`publicToken`) órfãos | Conectar versionamento muda o contrato de escrita do documento em produção |
| CYC-006 Assinatura eletrônica | Só schema + decisão de produto (gov.br) documentada; zero integração | Integração externa nova completa, decisão de produto/segurança que merece checkpoint próprio |
| CYC-007 Fechamento determinístico | Sem violação ativa (IA nunca fecha negócio, comprovado por teste dedicado); `dealClosure.ts` pronto mas não chamado por `updateLeadStatus` | Conectar o gate bloquearia o fluxo de fechamento manual que funciona hoje em produção — decisão de produto |
| CYC-008 Runtime/idempotência | Runtime inexistente; código de `advanceCadenceRun` já tem falha de concorrência real (dispatch antes de lock/checagem) | Não há runtime para corrigir contra; falha registrada como bloqueador para quando o worker for construído |
| CYC-009 UI | Rota real, no menu, mas somente leitura; sem E2E; sem cobertura de acessibilidade | UI de escrita depende do runtime (CYC-002/008) existir primeiro |

## Gate final
- typecheck: `npx tsc --noEmit` — limpo, 0 erros
- lint: `npm run lint` — 0 erros, 80 warnings (mesmo nível pré-existente)
- unit: `npx vitest run -c vitest.unit.config.ts` — **166/166 arquivos, 1298/1298 testes** (era
  163/1288 antes desta sprint — +3 arquivos/testes novos de `whatsapp.routes.test.ts` +
  regeneração do Prisma Client)
- integration: `npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts
  tests/integration/whatsapp-optout-gating.test.ts` (Postgres real) — **8/8 testes**, incluindo os
  2 renomeados
- build: não executado nesta rodada (nenhuma mudança de código de produção fora do fix pontual de
  `whatsapp.routes.ts`, já coberto por tsc/lint/unit/integration)
- e2e: não executado nesta rodada (nenhuma mudança de UI)

## Skips e flakes
0 — nenhum teste pulado ou instável observado nesta rodada.

## Riscos restantes
| Risco | Dono | Motivo do aceite | Revisar em |
|---|---|---|---|
| Falha de concorrência em `advanceCadenceRun` (duplo envio sob retry) | 16 (runtime/workers) | Não há runtime hoje para exercitar o risco; deve ser corrigido antes de plugar um worker, não depois | Quando CYC-008 for priorizada |
| `dealClosure.ts` não conectado — fechamento manual sem evidência estruturada | 17 (cadência) + 04 (CRM/BI) + 00 (produto) | Conectar agora quebraria o fluxo manual em produção sem decisão de negócio prévia | Quando CYC-007 for priorizada |
| `CallSuppression` + `customFields.optOutWhatsApp` como fontes paralelas ao `OptOutRecord` unificado | 06 (integrações) + 17 | Migração de leitura completa é passo já identificado, não executado; risco mitigado por `isSuppressed` consultar as duas fontes hoje | Sprint futura de consolidação de opt-out |
| `followUp.worker.ts` (legado, ativo em produção) não conhece o opt-out unificado nem a máquina de estados nova | 16 + 17 | Substituição do worker legado é parte da construção de CYC-002/008, não uma correção isolada | Quando o runtime de cadência for construído |

## Decisão

**REPROVADA** quanto ao escopo funcional completo da Sprint 06 — 8 dos 9 itens do roadmap (CYC-002
a CYC-009) permanecem como domínio/schema não conectados a runtime real, e a jornada de aceite
completa (`lead → cadência → contato → reply → reunião → proposta → aceite/assinatura →
fechamento`) não funciona ponta a ponta hoje. Isso é consistente com o critério de reprovação já
estabelecido nesta série de sprints (mesmo padrão da Sprint 03/onda-15: "critério de aceite do
roadmap é binário", e aqui o binário real é "a jornada funciona com dados reais" — não funciona).

Dentro desse quadro, **1 achado real de compliance foi identificado e corrigido com segurança**
(CYC-001: gap de enforcement de opt-out no envio manual de WhatsApp), verificado com gate completo
(tsc, lint, unit, integration real contra Postgres) e testes de regressão dedicados. Os demais 8
itens exigem trabalho de construção de feature nova (workers, integrações externas, decisões de
produto sobre gates de fechamento) que não cabe com segurança em correções pontuais dentro desta
rodada — cada um está documentado com o estado real e o motivo específico do adiamento em
`docs/CADENCE-CYCLE-AUDIT.md`, para que a próxima rodada (ou uma sprint dedicada por item) comece
da auditoria real, não de uma nova investigação do zero.
