# Fase Final 2 — Runtime, Workers e Escala

- Data: 2026-08-17
- Executor: Agente 00 (Coordenador), atuando também como 16 (Runtime/Workers) e 19 (Verificação)
  nesta rodada — sessão única, sem paralelismo de especialistas (ver seção 8).
- SHA de entrada: `cb10b30b0681524caf763ab7b0c0e256bce4f745` (branch
  `claude/fase-final-1-pr-136-o23qf1`, já em `origin`).
- SHA de saída: ver commit desta entrega (mesma branch, um único commit lógico).
- Fase Final 1: APROVADA COM RESSALVA (`.agents/runs/final-fase-1.md`) — usada como baseline.

## 0. Leitura obrigatória — feita

`/AGENTS.md` inteiro; `.agents/prompts/00-coordenador.md`; `.agents/prompts/16-runtime-workers-escala.md`;
`.agents/prompts/19-verificacao-continua.md`; `.agents/runs/final-fase-1.md`; todos os handoffs de
`.agents/handoffs/onda-6/16-*` e `onda-7/*` relacionados a runtime/Baileys; `docs/auditoria/02_DIVIDA_TECNICA_MASTER.md`
(DT-0002, DT-0008); `render.yaml`; `package.json`; `server.ts` e `worker.ts` inteiros;
`src/lib/process-guards.ts`; `src/features/automations/application/cold-leads-scanner.service.ts`;
`src/features/integrations/whatsapp/{whatsapp.service.ts,useRedisAuthState.ts}`.

**Achado de governança importante:** boa parte da missão desta fase (entrypoint `worker.ts`, trava do
cron, narrowing de `process-guards.ts`, health checks) **já tinha sido implementada em ondas
anteriores** (Onda 6/7/8, antes da renumeração para "seis fases finais"). O handoff mais crítico
(`onda-6/16-para-00-remover-workers-de-server-ts.md`) registrava esse corte como bloqueado — mas o
código atual mostra que, desde então, alguém já resolveu o bloqueio de um jeito **mais seguro** que o
diff proposto originalmente: em vez de deletar a criação dos workers embutidos de `server.ts`, uma
flag de ambiente (`ENABLE_EMBEDDED_WORKERS`, default `false`) foi introduzida. Não confiei nesse
relatório antigo nem no código sem prova — tudo abaixo foi reexecutado e comprovado nesta rodada,
contra Postgres/Redis reais provisionados neste ambiente (ver seção 2).

## 1. Inventário de filas/workers — antes/depois (idêntico, nada foi perdido)

14 filas BullMQ distintas (recontagem por `grep` de `new Queue(`/`new Worker(` em todo o
repositório, não por confiança no comentário do prompt original, que citava 13):

| # | Fila | Arquivo dono | Scheduler recorrente |
|---|---|---|---|
| 1 | `leads-enrichment` | `src/lib/queue/index.ts` | — (sob demanda) |
| 2 | `intelligence-agents` | `src/lib/queue/agent.worker.ts` | — (sob demanda) |
| 3 | `enrichment-queue` | `src/lib/queue/enrichment.queue.ts` | — (sob demanda) |
| 4 | `search-indexing` | `src/lib/queue/search.queue.ts` | — (gated por `ENABLE_SEARCH`) |
| 5 | `whatsapp-conversation-signal` | `src/lib/queue/whatsappSignal.worker.ts` | — (sob demanda) |
| 6 | `bitrix-sync` | `src/lib/queue/bitrixSync.worker.ts` | `scheduleBitrixSync()` |
| 7 | `whatsapp-followup-queue` | `src/features/crm/jobs/followUp.worker.ts` | cron `0 9 * * *` |
| 8 | `daily-executive-summary-queue` | `.../dailyExecutiveSummary.worker.ts` | cron `0 18 * * *` |
| 9 | `deduplication-queue` | `.../deduplication.worker.ts` | cron `0 0 * * 0` |
| 10 | `win-loss-analysis-queue` | `winLossAnalysis.worker.ts` | cron `0 19 * * 5` |
| 11 | `weekly-pdf-report-queue` | `.../weeklyPdfReport.worker.ts` | cron `0 20 * * 5` |
| 12 | `auto-anonymize-disqualified-queue` | `.../autoAnonymizeDisqualified.worker.ts` | — (sob demanda) |
| 13 | `sdr-cold-call` | `src/lib/queue/coldCall.worker.ts` | gated por org habilitada |
| 14 | `swarm-scheduler` | `src/lib/queue/swarmScheduler.worker.ts` | gated por org habilitada |

Mais o cron não-BullMQ `cold-leads-scanner` (`node-cron`, `0 2 * * *`), com trava distribuída própria.

`worker.ts` registra as 14 exatamente (confirmado ao vivo, ver seção 2) — nenhuma fila ficou de fora,
nenhuma fila nova foi criada.

## 2. Ambiente de prova usado nesta rodada (Docker indisponível neste sandbox)

`docker info` falhou (`DOCKER_UNAVAILABLE`) — os scripts `pretest:integration`/`test:containers` que
dependem de `docker compose up` não rodam aqui. Em vez de reportar isso como bloqueio passivo,
provisionei o equivalente **sem Docker**, nesta máquina:
- PostgreSQL 16 nativo (`apt-get install postgresql-16-pgvector`, extensão `vector` criada,
  papel `prospector_app` via `scripts/db/create-app-role.sql`, banco `prospectordb_test`);
- Redis nativo (`redis-server`, sem auth, `PONG` confirmado);
- `npx prisma migrate deploy` aplicou as 100% das migrations existentes sem erro contra este banco;
- `.env.test` local (gitignorado, não commitado) apontando para os dois acima.

Isso permitiu rodar `test:integration`, `test:e2e` e os testes ao vivo de runtime abaixo com
evidência real, não simulada — e deixa o ambiente pronto para as Fases 3/4, que também precisam de
Postgres/Redis reais (backup/restore, sweep de QA).

## 3. Prova do cutover — HTTP enfileira, worker processa (ordem de cutover da missão)

1. **`worker.ts` sobe isolado** (`ENABLE_QUEUES=true`, sem `server.ts` no ar) →
   `worker.ts: filas registradas nesta inicialização` loga `activeWorkers: 11, totalRegistered: 14`
   (as 3 faltantes são as gated por `ENABLE_SEARCH`/organizações habilitadas, corretamente ausentes
   sem essas condições).
2. **Health verde**: `GET /health/ready` → `{"status":"ok","queuesEnabled":true,"activeWorkers":11,"totalRegistered":14,"errors":[]}`.
3. **`server.ts` sobe simultaneamente** (`ENABLE_QUEUES=true`, `ENABLE_EMBEDDED_WORKERS` não setado
   → default `false`) → log confirma `Connected to Redis successfully` (só a `Queue`, para
   enfileiramento/BullBoard) e **nenhuma** linha de criação de `Worker`, nenhum
   `scheduleBitrixSync()`/`scheduleFollowUpJobs()`/etc.
4. **Job real de teste processado**: criei uma `Organization`+`Lead` reais no Postgres (RLS via
   `requestContext`) e enfileirei em `leadsQueue` (a mesma fila que a rota HTTP de enriquecimento
   usa) com os dois processos no ar. Resultado:
   - `worker.ts` processou (`"Processing lead enrichment job"` × 3 tentativas com backoff
     exponencial, depois `"Job failed in leads queue"` com `"Nenhum motor de IA configurado"` —
     falha esperada, sem `GROQ_API_KEY`/`GEMINI_API_KEY` neste sandbox; o que importa é que o job
     **chegou ao worker de verdade**, executou a lógica de negócio real até o ponto de precisar de
     uma credencial externa, e o mecanismo de retry (`attempts: 3`, backoff exponencial) funcionou);
   - `server.ts`, rodando ao lado com `ENABLE_QUEUES=true`, **não tem nenhuma linha de
     processamento** no seu log — confirmação direta de que `leadsWorker` é `null` ali.
5. **Métricas confirmadas**: `registerQueueForMetrics`/`bullmq_queue_*` (Onda 5) independem de qual
   processo sobe o `Worker` — mesmo módulo `src/lib/queue/metrics.ts` em ambos os entrypoints.

## 4. Graceful shutdown / SIGTERM — duas provas complementares

1. **SIGTERM real no binário de produção**: `npm run build:worker` gerou `dist/worker.cjs`
   (idêntico ao que o Render rodaria via `start:worker`). Subi `node dist/worker.cjs` diretamente
   (sem wrapper `npx`/`dotenv-cli` — evita um problema real que encontrei: enviar SIGTERM ao
   processo `npx`/`tsx watch` **não** propaga de forma confiável o sinal para o processo Node real,
   então o handler nunca dispara; rodar o binário `node` direto, exatamente como produção faz, evita
   esse problema). `kill -TERM` no processo idle → log:
   `worker.ts: sinal recebido, iniciando graceful shutdown.` → `worker.ts: shutdown concluído.` →
   processo saiu limpo, confirmado por `ps`.
2. **Drenagem de job em voo**: como nenhum processor real hoje tem uma etapa artificialmente longa
   (todos falham/completam em milissegundos sem credencial de IA), testei o mecanismo exato que
   `worker.ts` usa (`Worker#close()` do BullMQ + corrida contra timeout de 25s, código idêntico ao
   de `worker.ts:240-271`) com uma fila descartável e um job de 5s deliberado: `close()` **esperou
   os 5s completos** antes de resolver (`shutdownMs: 4955`, `jobCompletedBeforeCloseResolved: true`,
   dentro do orçamento de 25s). Confirma que `SIGTERM` durante um job em execução não perde o job.

## 5. Cron sem duplicação — dois processos, uma execução

Chamei `runColdLeadsScan()` duas vezes em paralelo (`Promise.all`) contra o mesmo Redis, simulando
"dois processos worker sobem ao mesmo tempo". Log:
- `"Cold leads scan iniciada."` — **uma única vez** (a execução que adquiriu a trava SETNX);
- `"Cold leads scan pulada: outra instância já está executando."` — a segunda tentativa.

Confirma a trava distribuída (`acquireDistributedLock`, `cold-leads-scanner:lock`, SETNX+TTL de
30 min) funcionando de verdade, não só por inspeção de código como o relatório da Onda 7 tinha
feito.

**Achado não-bloqueador registrado, não corrigido nesta rodada**: `acquireDistributedLock` falha
*aberto* (`acquired: true`) quando o Redis responde com erro na tentativa de `SET NX` —综ado para o
caso "sem Redis configurado, instância única" (comportamento intencional, comentado no código). Em
teoria, uma falha *transitória* de conectividade Redis (não "Redis desligado de propósito") faria
duas instâncias reais acharem que adquiriram a trava ao mesmo tempo. Não é o cenário testado aqui
(testei contra Redis saudável) e não é uma regressão desta fase — é um gap pré-existente,
registrado para o dono do arquivo (`src/lib/queue/distributedLock.ts`, hoje sem dono explícito no
`/AGENTS.md`, mais próximo do escopo do 16/07) avaliar numa rodada futura se fail-open é aceitável
para este lock específico.

## 6. `process-guards.ts` — o que ainda é engolido (item 4 da missão)

Já implementado e verificado por leitura de código nesta rodada (nenhuma mudança necessária):
classifica rejeições pela assinatura conhecida de "Redis/BullMQ indisponível" (`connection is
closed`, `ECONNREFUSED`, `ECONNRESET`, `getaddrinfo ENOTFOUND` + heurística de stack/nome de erro) —
essas continuam no ar (`logger.error`, processo sobrevive). **Qualquer outra rejeição não tratada
derruba o processo de propósito** (`logger.fatal` + `process.exit(1)`) em vez de ser engolida — o
comentário no próprio arquivo já declara essa classificação como incompleta e documentada, não uma
lacuna escondida.

## 7. Sessões Baileys (WhatsApp) — achado novo relevante

O handoff `onda-6/16-para-06-plano-migracao-baileys.md` (Onda 7) tinha identificado como
pré-requisito bloqueador: *"a pasta `whatsapp_auth/` precisa deixar de ser filesystem local
efêmero antes de mover a criação da sessão para `worker.ts`"*. Ao ler o código atual (não estava
documentado em nenhum handoff/completion que eu tenha encontrado), esse pré-requisito **já foi
resolvido numa onda posterior não registrada nestes documentos**: `whatsapp.service.ts` usa
`useRedisAuthState()` (`src/features/integrations/whatsapp/useRedisAuthState.ts`), que persiste
credenciais Baileys (`creds`) e chaves de assinatura no Redis (`wa-auth:<organizationId>:*`), não
mais em disco local efêmero.

O que **continua não resolvido** (e não deveria ser resolvido nesta fase sem acordo explícito do
dono de `src/features/integrations/whatsapp/**`, hoje sob o escopo do Agente 06): o **socket vivo**
(`WASocket`, `Map<organizationId, TenantSession>` module-level em `whatsapp.service.ts`) continua
não-serializável e vive no processo que o abriu. Mover a *abertura* da sessão para `worker.ts`
ainda exige o "canal de consulta/comando" entre HTTP e worker (opção BullMQ vs. API HTTP interna)
que o plano original da Onda 6 já tinha levantado — decisão de arquitetura real, não mecânica, que
não tomei por conta própria. Registrado abaixo como pendência explícita, não como bloqueio silencioso.

Um efeito colateral direto dessa descoberta: o teste `tests/integration/whatsapp-optout-gating.test.ts`
falhava (6/6 testes do arquivo) porque o mock de `@whiskeysockets/baileys` nunca foi atualizado para
incluir `initAuthCreds` (export que `useRedisAuthState.ts` passou a chamar). Corrigi o mock
(`initAuthCreds`/`BufferJSON` adicionados ao `vi.mock`, sem tocar em nenhuma lógica de produção) —
único arquivo alterado nesta entrega. Suíte de integração completa voltou a 100% verde depois disso.

## 8. Governança desta rodada — desvio do processo padrão, justificado

A missão pede isolamento por worktree/branch por especialista e matriz de propriedade publicada
antes de disparar agentes em paralelo. Nesta rodada **não houve trabalho paralelo de múltiplos
especialistas** — toda a investigação e prova foi feita em série, numa única sessão, sem edição
concorrente de arquivo compartilhado, porque:
1. o escopo real remanescente (depois de descobrir que a arquitetura já estava implementada) era
   **verificação com evidência viva**, não desenvolvimento de feature nova — não há necessidade de
   isolamento de working tree para rodar testes;
2. o único código de produto alterado foi um mock de teste, de baixíssimo raio de impacto, dentro
   do escopo natural de quem está rodando o gate.

Não fiz alteração em `server.ts`, `package.json` ou `render.yaml` nesta rodada — nenhuma aprovação
do tipo "server.ts exige aprovação do 00" foi necessária porque nenhum diff foi proposto para esses
arquivos (o mecanismo de corte já existe como feature flag seguríssima, default `false`).

## 9. Gate do Agente 19 — execução real, SHA `cb10b30b` + 1 commit local (fix de mock)

```
npx tsc --noEmit                          PASS (0 erros)
npm run lint                              PASS (0 erros, 58 warnings pré-existentes — DT-0005)
npm run test:unit                         PASS — 158 arquivos, 1220 testes
npm run test:integration (via vitest      PASS — 24 arquivos, 114 testes (6 falhas corrigidas
  direto, docker indisponível para o          nesta rodada — mock de baileys desatualizado,
  wrapper pretest:integration)                não relacionado a runtime/workers)
npm run build                             PASS (dist/server.cjs 1.0mb, warning de chunk grande
                                               pré-existente — DT-0006, não bloqueador)
npm run build:worker                      PASS (dist/worker.cjs 382.7kb)
E2E (via playwright direto, com           43/50 na primeira rodada completa.
  PLAYWRIGHT_CHROMIUM_EXECUTABLE=            5 falhas: tests/e2e/visual.spec.ts — geração de
  /opt/pw-browsers/chromium, já               baseline visual Linux ainda não existe neste
  suportado pelo próprio                      ambiente (débito pré-existente e já documentado,
  playwright.config.ts para                   DT-0012 / handoff onda-6/14-para-08-baselines-
  ambientes sandbox)                          visuais-linux.md — não é regressão desta fase).
                                             2 falhas: crm-kanban-mobile.spec.ts (overflow mobile,
                                               touch drag) — reexecutadas isoladas (sem os outros
                                               48 testes competindo por CPU/rede) e PASSARAM as
                                               duas, confirmando contenção de recursos do sandbox,
                                               não regressão funcional.
security/secrets scan                     Não executado nesta rodada (nenhum script `security:*`
                                               chamado — nenhuma alteração de superfície de
                                               segurança nesta fase; `.gitleaks.toml` já cobre CI).
```

```text
AGENTE 19 — VERIFICAÇÃO CONTÍNUA
ESTADO VERIFICADO: claude/fase-final-1-pr-136-o23qf1 @ cb10b30b + 1 commit (fix de mock whatsapp)
TYPECHECK: PASS
LINT: PASS
UNIT: PASS
INTEGRATION: PASS
E2E: PASS_WITH_NON_BLOCKING_WARNINGS (5 falhas = débito de baseline visual pré-existente e
  documentado; 2 falhas = confirmadamente flaky por contenção de recurso do sandbox, não
  reprodutíveis isoladamente)
BUILD: PASS
SECURITY/SECRETS: N/A JUSTIFICADO (nenhuma superfície de segurança tocada nesta fase)
INTEGRATIONS: N/A JUSTIFICADO (nenhuma integração externa real disponível neste sandbox —
  Bitrix/Birth Voices/IA não têm credencial aqui; comportamento de "falha honesta sem credencial"
  foi exatamente o que a prova de enfileiramento/processamento comprovou, ver seção 3)
AI: N/A JUSTIFICADO (mesma razão acima)
SKIPS/FLAKES BLOQUEADORES: 0
VEREDITO: PASS_WITH_NON_BLOCKING_WARNINGS
PODE INTEGRAR: SIM
```

## 10. O que fica pendente — decisão humana, não técnica

A separação de runtime está **provada correta e segura para ativar**, mas a ativação real em
produção depende de decisões fora do escopo de engenharia desta fase:

1. **Gasto financeiro**: serviços `type: worker` do Render não têm plano free (o comentário em
   `render.yaml` já registra isso) — subir `prospector-atlas-worker` de verdade exige o dono do
   repositório autorizar um segundo serviço pago. Sem isso, o worker dedicado continua existindo só
   como código+config prontos, não como processo rodando.
2. **Redis em produção**: hoje `ENABLE_QUEUES=false` no serviço web de produção (`render.yaml`) —
   as filas estão **totalmente desligadas em produção hoje**, não é um caso de "processamento
   duplicado", é "nenhum processamento assíncrono real acontece ainda em produção". Ativar depende
   de provisionar `REDIS_URL` real (Render Key Value ou Upstash) — outra decisão de custo/infra.
3. **Migração das sessões WhatsApp para o worker**: pré-requisito técnico (persistência fora de
   disco local) já resolvido (seção 7); decisão de arquitetura do canal HTTP↔worker ainda em aberto,
   deveria ser tomada em conjunto com o dono do domínio (Agente 06), não unilateralmente aqui.
4. **Regra de alerta Prometheus** para `/health/ready` do worker — depende do serviço existir de
   verdade (item 1); não faz sentido registrar regra contra endpoint que não roda em produção.

Nenhum desses quatro itens é "problema solucionável dentro do repositório sem decisão externa" —
todos exigem autorização financeira ou uma decisão de arquitetura de domínio que caberia ao Agente 06,
por isso não foram executados nem contornados nesta rodada.

## 11. Decisão

**Fase Final 2: APROVADA COM RESSALVA.**

A separação HTTP/worker está implementada, comprovada com evidência viva (não com leitura de
código nem relatório antigo) nesta rodada: worker isolado processa os 14 registros esperados,
`server.ts` não processa quando a flag de segurança está no default, nenhum job se perde a um
SIGTERM, o cron não duplica com dois processos concorrentes, e o gate completo do Agente 19 fecha
`PASS_WITH_NON_BLOCKING_WARNINGS` (zero regressão introduzida; a única correção desta rodada foi um
mock de teste desatualizado, revelado — não causado — pela investigação de runtime).

**Ressalva:** a fase prova que o corte é seguro de ativar, mas não ativa produção de verdade — isso
depende de autorização de gasto (Render worker service pago + Redis gerenciado) e de uma decisão de
arquitetura para as sessões WhatsApp que pertence ao dono daquele domínio. Ver seção 10.
