# Onda 19 — Sprint 07: construção do runtime de cadência (CYC-008)

## Identificação
- Sprint: 07 (continuação direta do CYC-008 documentado como pendência na Onda 18)
- Onda: 19
- SHA de entrada: `7f0e65a` (main, após merge do PR #166/onda-18)
- Branch de integração: `claude/sprint-07-cadencia-runtime`
- Status: **APROVADA** para o escopo tratado (CYC-008 — runtime/idempotência da cadência)

## Contexto

A Onda 18 documentou que o domínio de cadência (`advanceCadenceRun`, Onda 10) era puro e testado,
mas sem nenhum runtime real chamando-o — "schema Prisma bem desenhado + domínio TypeScript puro e
testado unitariamente + zero ligação a runtime real". Esta rodada tratou especificamente esse gap
(CYC-008), a pedido explícito do usuário após uma explicação do que "runtime de cadência"
significa. Os demais 7 itens pendentes da Onda 18 (CYC-002 a CYC-007, CYC-009) **não foram
revisitados** nesta rodada — continuam no estado documentado em `docs/CADENCE-CYCLE-AUDIT.md`.

Auditoria prévia à implementação (3 investigações paralelas independentes) mapeou com precisão: o
ponto exato do bug de concorrência em `advanceCadenceRun` (linha do `dispatcher.dispatch` sem
nenhuma trava antes), o padrão de worker/fila já estabelecido no repo (`whatsappCommand.worker.ts`,
`followUp.worker.ts`, `bitrixSync.worker.ts` — todos BullMQ `Worker` + `Queue.upsertJobScheduler`),
e como os canais reais (`sendWhatsAppMessage`, `sendEmail`) e o opt-out unificado (`isOptedOut`)
já funcionam, para não reinventar nenhum dos dois.

## Trabalho realizado

### 1. Corrigida a falha de concorrência em `advanceCadenceRun`

`AdvanceCadenceRunDeps` ganhou uma porta `lock: CadenceRunLockPort`. `advanceCadenceRun` adquire a
trava por `runId` antes de ler/decidir/despachar/gravar, libera no `finally` (mesmo se o
dispatcher lançar). Produção usa `RedisCadenceRunLock.ts`, reaproveitando a mesma trava distribuída
já usada por `cold-leads-scanner.service.ts`/`stagnation-scanner.service.ts` — nenhum mecanismo
novo inventado. Quando a trava está contendida, o ciclo devolve `{type:'wait', reason:'locked'}`
em vez de lançar — o próximo tick do worker tenta de novo.

Prova por teste dedicado (`advanceCadenceRun.lock.test.ts`, 3 casos): dois ciclos concorrentes para
o MESMO run — só um chama o dispatcher; trava indisponível não lança nem grava nada; a trava é
liberada mesmo quando o dispatcher lança uma exceção (não fica presa para sempre).

### 2. Construído o worker/scheduler real

`src/features/cadence/jobs/cadenceRun.worker.ts` — BullMQ `Worker` + `Queue.upsertJobScheduler`
(tick a cada 5 min), registrado em `worker.ts` no mesmo lugar/formato dos demais workers dedicados.
Varre `CadenceRun` com `status=Active`, valida o JSON de `CadenceSequence.touches` antes de
confiar nele (sequência malformada é pulada e logada, nunca derruba a varredura inteira), e chama
`advanceCadenceRun` por run, isolando falha de UM run (nunca aborta o resto do tick).

### 3. Construídos os dispatchers reais de canal

`src/features/cadence/infra/dispatchers/CadenceDispatchers.ts` — WhatsApp via `sendWhatsAppMessage`
(já existente e já testado; opt-out é checado duas vezes por design — uma vez pelo domínio, outra
pela própria função — redundante e seguro, decisão deliberada depois do bug real do CYC-001/onda-18
com esse mesmo flag) e e-mail via `sendEmail`/`mailer.ts`. Canal de voz falha honestamente (nenhuma
integração de voz de cadência existe) em vez de fingir envio.

**Efeito colateral necessário**: `sendEmail` devolvia `Promise<void>`; agora devolve
`{messageId: string | null}` (o `messageId` real do transporte SMTP). Mudança de contrato
retrocompatível (todos os 6 callers existentes já ignoravam o retorno) — cobrida por 2 novos casos
em `mailer.test.ts`.

### 4. `providerMessageId` gravado de verdade

Coluna existia em `CadenceTouchAttempt` desde a Onda 9, nunca escrita (achado da Onda 18). Threading
completo: `CadenceDispatcher.dispatch` → `recordTouchAttempt` → `PrismaCadenceRunRepository.save`.
Funciona para e-mail (id real do SMTP); para WhatsApp fica `null` — `sendWhatsAppMessage` não expõe
o id do Baileys hoje, e mudar essa função (usada por outros callers de produção) ficou fora do
escopo desta rodada.

### 5. Achado novo, não mapeado até esta rodada: RLS bloqueava qualquer scan cross-tenant

Ao escrever o teste de integração contra Postgres real, `scanAndAdvanceCadenceRuns` devolvia sempre
`0` runs processados mesmo com um `CadenceRun` ativo de verdade no banco. Causa raiz: `CadenceRun`/
`CadenceSequence` têm `FORCE ROW LEVEL SECURITY` (`current_setting('app.current_tenant_id') =
organizationId OR current_setting('app.bypass_rls') = 'on'`) — uma leitura sem nenhum dos dois
setados devolve zero linhas sempre, e um worker que precisa descobrir "quais organizações têm run
ativo" *antes* de saber qual tenant escopar não tinha como fazer essa pergunta: nem uma leitura sem
contexto (RLS nega), nem `bypassRls:true`, porque em produção o bypass só é honrado para models na
allowlist `BYPASS_RLS_ALLOWED_MODELS` (`src/lib/prisma.ts`), e `CadenceRun`/`CadenceSequence` não
estavam nela.

**Corrigido**: `CadenceRun`/`CadenceSequence` adicionados à allowlist — só cobrem a descoberta
inicial cross-tenant (não contêm credencial nem dado pessoal do lead, diferente de
`BitrixConnection`, já presente na mesma lista pelo motivo análogo). A partir do momento em que o
worker sabe o `organizationId` de cada run, todo o resto do ciclo (`advanceCadenceRun`, dispatch,
gravação) roda escopado normalmente por tenant, sem bypass.

**Risco levantado, não investigado nem corrigido nesta rodada**: `followUp.worker.ts` (o worker de
follow-up de WhatsApp já em produção) tem o mesmo padrão de leitura sem contexto
(`prisma.lead.findMany` sem `requestContext.run`), e `Lead` tem a mesma política `FORCE ROW LEVEL
SECURITY`. Se o raciocínio acima se aplica igualmente lá, esse worker pode estar processando sempre
`0` leads em produção — não confirmado por teste (é outro worker, outra feature, mereceria sua
própria verificação dedicada), mas registrado explicitamente como risco a checar na próxima rodada
que tocar cadência/follow-up.

## O que continua pendente (não tratado nesta rodada, deliberadamente)

- **CYC-002 a CYC-007, CYC-009**: sem mudança — estado documentado em
  `docs/CADENCE-CYCLE-AUDIT.md` continua o da Onda 18.
- **Gatilho de início de cadência**: não existe rota/UI para criar uma `CadenceSequence` ou iniciar
  uma `CadenceRun` (`cadence.routes.ts` é só leitura). O runtime construído nesta rodada está
  correto e testado ponta a ponta, mas fica ocioso em produção até essa decisão de produto (quem
  inicia uma cadência, com que sequência/conteúdo) ser tomada — deliberadamente não inventada aqui.
- **`providerMessageId` do WhatsApp**: fica `null` até `sendWhatsAppMessage`/o socket Baileys
  exporem o id real da mensagem enviada.

## Gate final
- typecheck: `npx tsc --noEmit` — limpo, 0 erros
- lint: `npm run lint` — 0 erros, 82 warnings (era 80 antes desta sprint; os 2 novos são
  `no-explicit-any` no cast de conexão ioredis/BullMQ do novo worker, mesmo padrão já presente em
  `followUp.worker.ts` e outros workers do repo — não é um padrão novo introduzido aqui)
- unit: `npx vitest run -c vitest.unit.config.ts` — **167/167 arquivos, 1303/1303 testes** (era
  166/1298 antes desta sprint — +1 arquivo/+5 testes de `advanceCadenceRun.lock.test.ts`, +2 testes
  de `mailer.test.ts`)
- integration: `npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts`
  (Postgres + Redis reais) — **33/33 arquivos, 140/140 testes**, incluindo o novo
  `cadenceRun.worker.test.ts` (5 casos: scan vazio, despacho real via WhatsApp mockado só no
  socket, opt-out real, sequência malformada, RLS cross-tenant com duas organizações)
- build: `npm run build` e `npm run build:worker` — ambos limpos
- e2e: não executado nesta rodada (nenhuma mudança de UI)

Nota de ambiente: a suíte de integração falhava inicialmente por duas migrations do Market
Intelligence (mergeadas via PR #160, posterior ao início desta sessão) nunca aplicadas ao banco de
teste local (`prospectordb_test`), incluindo uma falha real de permissão (`CREATE EXTENSION
pg_trgm` sem privilégio) que deixou uma migration em estado `failed`. Resolvido localmente
(extensão criada como superuser, migration marcada `--rolled-back` e reaplicada) — não é uma
regressão desta sprint, é drift de ambiente do sandbox já visto antes nesta série.

## Skips e flakes
0 — nenhum teste pulado ou instável observado nesta rodada.

## Riscos restantes
| Risco | Dono | Motivo do aceite | Revisar em |
|---|---|---|---|
| `followUp.worker.ts` pode estar processando sempre 0 leads em produção (mesmo padrão de RLS sem contexto encontrado e corrigido no worker de cadência) | 16 (runtime/workers) | Não investigado nesta rodada — é outro worker/feature, merece verificação própria antes de qualquer mudança | Próxima rodada que tocar follow-up de WhatsApp, com prioridade alta dado o impacto potencial |
| Runtime de cadência construído mas ocioso — não existe rota/UI para iniciar uma `CadenceRun` | 17 (cadência) + 00 (produto) | Decisão de produto (quem inicia, com que conteúdo) não pode ser inventada por uma correção de infraestrutura | Quando CYC-009 (UI) ou uma decisão de produto para gatilho de cadência for priorizada |
| `providerMessageId` de WhatsApp permanece `null` | 06 (integrações) | `sendWhatsAppMessage` não expõe o id do Baileys hoje; mudar essa função tem blast radius maior (outros callers) | Quando o campo for realmente necessário para suporte/depuração |
| Riscos já registrados na Onda 18 (CYC-002 a CYC-007, CYC-009) | vários | Não revisitados nesta rodada | Ver `docs/CADENCE-CYCLE-AUDIT.md` |

## Decisão

**APROVADA** para o escopo tratado: CYC-008 (runtime/idempotência da cadência) saiu de
"inexistente" para "construído e verificado contra Postgres e Redis reais" — trava de concorrência
real, worker/scheduler real, dispatchers reais para WhatsApp e e-mail, e um achado de RLS não
mapeado até esta rodada (bloqueio total de leitura cross-tenant sem bypass) identificado e
corrigido com escopo mínimo (2 models numa allowlist já existente).

O runtime está correto, mas **ainda não tem efeito observável em produção** até uma decisão de
produto sobre como uma cadência começa (rota/UI de criação de sequência e início de run) ser
tomada — isso é intencional e está documentado, não uma lacuna escondida. Os demais 7 itens da
Sprint 06 (CYC-002 a CYC-007, CYC-009) permanecem no estado da Onda 18, sem mudança nesta rodada.
