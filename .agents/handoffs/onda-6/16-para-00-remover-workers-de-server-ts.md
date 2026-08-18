- De: Agente 16 (Runtime, Workers e Escala)
- Para: Agente 00 (Coordenador)
- Onda: 6
- Status: resolvido
- Prioridade: bloqueador (bloqueia só o corte final de duplicação de processamento — não bloqueia
  esta onda, ver "Contexto adicional")

## Problema
`server.ts` continua criando os mesmos 14 workers BullMQ (nomeados "13" no prompt original, ver
inventário completo no relatório desta onda) e chamando `ColdLeadsScannerService.start()` no mesmo
processo que agora também roda `worker.ts` (novo entrypoint desta onda). Rodar os dois processos
com `ENABLE_QUEUES=true` ao mesmo tempo **duplica o processamento**: o BullMQ não impede dois
`Worker` concorrentes na mesma fila — ambos competem pelo mesmo job (não é necessariamente
duplicação de execução, já que o BullMQ faz lock por job entre workers da mesma fila, mas é
concorrência desnecessária pelo mesmo pool de trabalho, event loop competindo com requisição HTTP,
e duplicação real dos `schedule*()` idempotentes que dependem de jobId fixo — cada instância tenta
re-registrar o mesmo repeatable job).

`server.ts` é propriedade exclusiva sob aprovação do Agente 00 (`/AGENTS.md` → "Propriedade
exclusiva de arquivos"), por isso não editei o arquivo. `worker.ts` já existe, testado e funcional
(ver relatório da onda) — falta só o corte em `server.ts`.

## Arquivo(s) envolvido(s)
`/home/user/wt-agente-16/server.ts` (linhas 56, 424-503 na versão atual desta onda)

## Alteração necessária
Diff exato proposto (aplicável literalmente):

```diff
--- a/server.ts
+++ b/server.ts
@@
-import { createLeadsWorker } from './src/lib/queue/index.js';
-import { createAgentWorker } from './src/lib/queue/agent.worker.js';
-import { createEnrichmentWorker } from './src/lib/queue/enrichment.queue.js';
-import { createSearchWorker } from './src/lib/queue/search.queue.js';
-import { initMeiliIndexes } from './src/lib/search/index.js';
+// createXWorker() e initMeiliIndexes() foram movidos para worker.ts (Onda 6, Agente 16) — este
+// processo HTTP só enfileira, não processa. As Queue continuam importadas abaixo onde já eram
+// usadas (BullBoard, enfileiramento de rotas).
 import { observabilityMiddleware } from './src/shared/middlewares/observability.js';
 import client from 'prom-client';
 import { setupDI } from './src/shared/di/setup.js';
 import { ExpressAdapter } from '@bull-board/express';
 import { createBullBoard } from '@bull-board/api';
 import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
 import { leadsQueue } from './src/lib/queue/index.js';
 import { searchQueue } from './src/lib/queue/search.queue.js';
 import { agentQueue } from './src/lib/queue/agent.worker.js';
-import { createColdCallWorker, scheduleColdCallCampaigns } from './src/lib/queue/coldCall.worker.js';
-import { createWhatsAppSignalWorker } from './src/lib/queue/whatsappSignal.worker.js';
-import { enabledOrganizations } from './src/features/integrations/birth-voice/coldCall.service.js';
-import { createSwarmSchedulerWorker, scheduleSwarmScheduler } from './src/lib/queue/swarmScheduler.worker.js';
-import { enabledOrganizations as swarmSchedulerEnabledOrganizations } from './src/features/intelligence/services/swarmScheduler.service.js';
-import { createBitrixSyncWorker, scheduleBitrixSync } from './src/lib/queue/bitrixSync.worker.js';
-import { createFollowUpWorker, scheduleFollowUpJobs } from './src/features/crm/jobs/followUp.worker.js';
-import { createExecutiveSummaryWorker, scheduleExecutiveSummaryJob } from './src/features/crm/jobs/dailyExecutiveSummary.worker.js';
-import { createDeduplicationWorker, scheduleDeduplicationJob } from './src/features/crm/jobs/deduplication.worker.js';
-import { createWinLossAnalysisWorker, scheduleWinLossAnalysisJob } from './src/features/intelligence/services/winLossAnalysis.worker.js';
-import { createWeeklyPdfReportWorker, scheduleWeeklyPdfReportJob } from './src/features/crm/jobs/weeklyPdfReport.worker.js';
-import { createAutoAnonymizeWorker, scheduleAutoAnonymizeJob } from './src/features/crm/jobs/autoAnonymizeDisqualified.worker.js';
 import { lgpdRouter } from './src/features/lgpd/lgpd.routes.js';
 import { threecxRoutes, threecxWebhookRouter } from './src/features/integrations/threecx/threecx.routes.js';
-import { ColdLeadsScannerService } from './src/features/automations/application/cold-leads-scanner.service.js';
 import swaggerUi from 'swagger-ui-express';
@@
-    // Gated por ENABLE_QUEUES: um BullMQ Worker (diferente de uma Queue) conecta no Redis
-    // avidamente ao ser criado — sem Redis disponível, isso derruba o processo com um
-    // AggregateError [ECONNREFUSED] não tratado em vez de degradar como o restante da app.
-    const leadsWorker = queuesEnabled ? createLeadsWorker() : null;
-    const agentWorker = queuesEnabled ? createAgentWorker() : null;
-    const enrichmentWorker = queuesEnabled ? createEnrichmentWorker() : null;
-    const whatsappSignalWorker = queuesEnabled ? createWhatsAppSignalWorker() : null;
-    const bitrixSyncWorker = queuesEnabled ? createBitrixSyncWorker() : null;
-    const followUpWorker = queuesEnabled ? createFollowUpWorker() : null;
-    const execSummaryWorker = queuesEnabled ? createExecutiveSummaryWorker() : null;
-    const deduplicationWorker = queuesEnabled ? createDeduplicationWorker() : null;
-    const winLossWorker = queuesEnabled ? createWinLossAnalysisWorker() : null;
-    const pdfWorker = queuesEnabled ? createWeeklyPdfReportWorker() : null;
-    const autoAnonymizeWorker = queuesEnabled ? createAutoAnonymizeWorker() : null;
-    // Sem Redis, `.add()` chega a enfileirar o comando e falha ao dar baixa nas retries —
-    // o próprio `.catch()` abaixo não é suficiente pra cobrir esse caminho interno do BullMQ,
-    // que já causou uma promise rejection não tratada (derrubando o processo) mesmo com ele.
-    if (queuesEnabled) {
-        scheduleBitrixSync().catch((err) => logger.error({ err }, 'Falha ao agendar a sincronização automática do Bitrix'));
-        scheduleFollowUpJobs().catch((err) => logger.error({ err }, 'Falha ao agendar jobs de follow-up'));
-        scheduleExecutiveSummaryJob().catch((err) => logger.error({ err }, 'Falha ao agendar job de summary executivo'));
-        scheduleDeduplicationJob().catch((err) => logger.error({ err }, 'Falha ao agendar job de deduplicacao'));
-        scheduleWinLossAnalysisJob().catch((err) => logger.error({ err }, 'Falha ao agendar job de win/loss analysis'));
-        scheduleWeeklyPdfReportJob().catch((err) => logger.error({ err }, 'Falha ao agendar job do pdf semanal'));
-        scheduleAutoAnonymizeJob().catch((err) => logger.error({ err }, 'Falha ao agendar job de anonimização automática'));
-    }
-
-    const searchWorker = queuesEnabled && env.ENABLE_SEARCH ? createSearchWorker() : null;
-    if (queuesEnabled && env.ENABLE_SEARCH) {
-        initMeiliIndexes().catch(() => logger.warn('Meilisearch offline'));
-    }
-
-    // Hoisted pro escopo da função (...)
-    let coldCallWorker: ReturnType<typeof createColdCallWorker> | null = null;
-    let swarmSchedulerWorker: ReturnType<typeof createSwarmSchedulerWorker> | null = null;
-
-    enabledOrganizations().then((coldCallOrgs) => {
-        coldCallWorker = queuesEnabled && coldCallOrgs.length > 0 ? createColdCallWorker() : null;
-        if (coldCallWorker) {
-            scheduleColdCallCampaigns().catch((err) =>
-                logger.error({ err }, 'Falha ao agendar a campanha de prospecção fria'),
-            );
-        }
-    }).catch(() => null);
-
-    swarmSchedulerEnabledOrganizations().then((swarmOrgs) => {
-        swarmSchedulerWorker = queuesEnabled && swarmOrgs.length > 0 ? createSwarmSchedulerWorker() : null;
-        if (swarmSchedulerWorker) {
-            scheduleSwarmScheduler().catch((err) =>
-                logger.error({ err }, 'Falha ao agendar o enxame autônomo'),
-            );
-        }
-    }).catch(() => null);
-
-    ColdLeadsScannerService.start();
-
-    // Graceful shutdown
+    // Workers, agendadores e o cron de cold-leads-scanner foram movidos para o processo dedicado
+    // `worker.ts` (Onda 6, Agente 16) — rodar como Render worker service separado (ver handoff
+    // 16-para-08). Este processo HTTP continua enfileirando (as Queue seguem importadas acima
+    // para BullBoard) mas não processa mais nenhum job.
+
+    // Graceful shutdown (HTTP/SSE/Redis — sem workers, já que não há mais nenhum neste processo)
     const shutdown = async (signal: string) => {
         logger.info(`${signal} received: closing gracefully`);
-        await leadsWorker?.close();
-        await agentWorker?.close();
-        await searchWorker?.close();
-        await enrichmentWorker?.close();
-        await whatsappSignalWorker?.close();
-        await bitrixSyncWorker?.close();
-        await followUpWorker?.close();
-        await execSummaryWorker?.close();
-        await deduplicationWorker?.close();
-        await winLossWorker?.close();
-        await pdfWorker?.close();
-        await autoAnonymizeWorker?.close();
-        await coldCallWorker?.close();
-        await swarmSchedulerWorker?.close();
         await shutdownLangfuse();
         await prisma.$disconnect();
         process.exit(0);
     };
```

Notas sobre o diff:
- `leadsQueue`, `searchQueue`, `agentQueue` continuam importados (usados pelo BullBoard em
  `/admin/queues` e por rotas que enfileiram) — não removi essas 3 linhas.
- O `shutdown()` de `server.ts` ainda fica incompleto mesmo depois deste corte (não fecha o
  `http.Server`/SSE/Redis explicitamente) — isso é o item 3 da minha missão ("graceful shutdown
  completo"), mas implementei essa lógica só no `worker.ts` novo, conforme instruído no meu
  prompt ("implemente a lógica no NOVO entrypoint, não em server.ts"). Se quiser que eu también
  proponha o diff completo do shutdown de `server.ts` (fechar `http.Server`, SSE, Redis), abro
  outro handoff — não fiz isso aqui por estar fora do que o prompt autorizou tocar sem aprovação
  prévia seguida.

## Teste esperado
1. Aplicar o diff em `server.ts`.
2. Subir `server.ts` com `ENABLE_QUEUES=true` — nenhum `Worker` é criado, só `Queue` (confirmar via
   log: nenhuma linha "Worker error"/"Connected to Redis" duplicada vinda de dois processos
   registrando o mesmo Worker).
3. Subir `worker.ts` com `ENABLE_QUEUES=true` no mesmo Redis — `curl localhost:3006/health/ready`
   deve reportar os workers ativos esperados.
4. Enfileirar um job via rota HTTP normal (ex.: criar um lead que dispara enrichment) e confirmar
   que ele é processado pelo `worker.ts` (log do worker), não pelo `server.ts`.

## Contexto adicional
Não marquei esta onda como bloqueada por isto: o prompt desta missão instrui explicitamente **não
editar `server.ts` sem aprovação** e criar o novo entrypoint "em paralelo" primeiro — o que foi
feito. A duplicação de processamento só se materializa se alguém rodar `worker.ts` E `server.ts`
com `ENABLE_QUEUES=true` ao mesmo tempo contra o mesmo Redis, o que **não é o estado atual de
produção** (produção hoje só roda `server.ts`). O bloqueador é para o **corte final**, não para
esta onda.

## Decisão do Coordenador (2026-08-15)

**Diff NÃO aplicado nesta onda.** Analisado linha a linha — tecnicamente correto (mantém as 3
`Queue` que BullBoard/rotas de enfileiramento precisam, ajusta `shutdown()` coerentemente) — mas
aplicá-lo isoladamente, sem `worker.ts` rodando como processo real em algum ambiente, para todo
processamento de fila silenciosamente: enriquecimento de lead, sync Bitrix, discagem fria, enxame
autônomo, follow-up, dedup, PDF semanal e o worker de anonimização LGPD (`autoAnonymizeDisqualified`)
parariam sem erro visível. Exatamente a classe de falha silenciosa que `/AGENTS.md` proíbe.

**Status alterado para `em-andamento`, dependente do handoff `16-para-08-deploy-worker-service.md`.**
Este corte só é seguro depois que 08 configurar `worker.ts` como serviço real (Render worker service)
e confirmar que ele está processando job de verdade. Até lá, `server.ts` continua sendo o único
processo que roda em produção — comportamento atual preservado, sem regressão.

Fica para a Onda 7 (ou uma leva dedicada), combinado com o deploy do 08: subir `worker.ts` real →
confirmar processamento → só então aplicar este diff e derrubar os workers de `server.ts` no mesmo
corte.

## Resolução (Sprint 00/Onda 12 — GOV-006, 2026-08-18)
O risco de duplicação de processamento que motivava este handoff foi eliminado por um caminho
diferente do diff original: `server.ts` e `src/config/env.ts` hoje gatam a criação de todos os
workers embutidos por `ENABLE_EMBEDDED_WORKERS` (default `false`, confirmado em `server.ts:472-475`
e `src/config/env.ts:66`) — com o flag desligado (estado padrão), `server.ts` nunca cria um `Worker`
BullMQ, só enfileira. Isso resolve o problema real (dois processos competindo pela mesma fila) sem
depender do corte completo proposto no diff original. `worker.ts` como serviço real no Render (ver
`onda-6/16-para-08-deploy-worker-service.md`) continua pendente e permanece registrado como item de
backlog pós-freeze — não bloqueia esta onda porque o estado padrão já é seguro.
