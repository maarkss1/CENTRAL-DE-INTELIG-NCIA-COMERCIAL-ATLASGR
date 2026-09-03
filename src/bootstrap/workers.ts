import type { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { queuesEnabled } from '../lib/queue/redis.js';
import { createLeadsWorker } from '../lib/queue/index.js';
import { createAgentWorker } from '../lib/queue/agent.worker.js';
import { createEnrichmentWorker } from '../lib/queue/enrichment.queue.js';
import { createSearchWorker } from '../lib/queue/search.queue.js';
import { initMeiliIndexes } from '../lib/search/index.js';
import { createColdCallWorker, scheduleColdCallCampaigns } from '../lib/queue/coldCall.worker.js';
import { createWhatsAppSignalWorker } from '../lib/queue/whatsappSignal.worker.js';
import { enabledOrganizations } from '../features/integrations/birth-voice/coldCall.service.js';
import {
  createSwarmSchedulerWorker,
  scheduleSwarmScheduler,
} from '../lib/queue/swarmScheduler.worker.js';
import { enabledOrganizations as swarmSchedulerEnabledOrganizations } from '../features/intelligence/services/swarmScheduler.service.js';
import { createBitrixSyncWorker, scheduleBitrixSync } from '../lib/queue/bitrixSync.worker.js';
import {
  createFollowUpWorker,
  scheduleFollowUpJobs,
} from '../features/crm/jobs/followUp.worker.js';
import {
  createExecutiveSummaryWorker,
  scheduleExecutiveSummaryJob,
} from '../features/crm/jobs/dailyExecutiveSummary.worker.js';
import {
  createDeduplicationWorker,
  scheduleDeduplicationJob,
} from '../features/crm/jobs/deduplication.worker.js';
import {
  createAccountIntelligenceSchedulerWorker,
  accountIntelligenceSchedulerQueue,
} from '../features/market-intelligence/jobs/accountIntelligenceScheduler.worker.js';
import {
  createWinLossAnalysisWorker,
  scheduleWinLossAnalysisJob,
} from '../features/intelligence/services/winLossAnalysis.worker.js';
import {
  createWeeklyPdfReportWorker,
  scheduleWeeklyPdfReportJob,
} from '../features/crm/jobs/weeklyPdfReport.worker.js';
import {
  createAutoAnonymizeWorker,
  scheduleAutoAnonymizeJob,
} from '../features/crm/jobs/autoAnonymizeDisqualified.worker.js';
import {
  createColdLeadsScannerWorker,
  scheduleColdLeadsScannerJob,
} from '../features/automations/application/cold-leads-scanner.service.js';
import {
  createStagnationScannerWorker,
  scheduleStagnationScannerJob,
} from '../features/automations/application/stagnation-scanner.service.js';
import {
  createForecastSnapshotWorker,
  scheduleForecastSnapshotJob,
} from '../features/commercial-intelligence/jobs/forecastSnapshotWeekly.worker.js';
import { createCopilotoTranscriptionWorker } from '../features/copiloto-ia/jobs/transcribeConversation.worker.js';

type CloseableWorker = Worker<any, any, string> | null;

/**
 * Handle mutável com todas as referências de worker embutido criadas no boot — inclusive as duas
 * que só existem depois de uma consulta assíncrona ao banco (coldCallWorker/swarmSchedulerWorker,
 * preenchidas por fora do fluxo síncrono de `startEmbeddedWorkers`). `createGracefulShutdown`
 * (shutdown.ts) lê estes campos no momento do sinal de encerramento, não no momento da criação do
 * handle — o mesmo comportamento (e a mesma janela de corrida, documentada) do server.ts original.
 */
export interface EmbeddedWorkersHandle {
  leadsWorker: CloseableWorker;
  agentWorker: CloseableWorker;
  enrichmentWorker: CloseableWorker;
  whatsappSignalWorker: CloseableWorker;
  bitrixSyncWorker: CloseableWorker;
  followUpWorker: CloseableWorker;
  execSummaryWorker: CloseableWorker;
  deduplicationWorker: CloseableWorker;
  winLossWorker: CloseableWorker;
  pdfWorker: CloseableWorker;
  autoAnonymizeWorker: CloseableWorker;
  coldLeadsScannerWorker: CloseableWorker;
  stagnationScannerWorker: CloseableWorker;
  accountIntelligenceSchedulerWorker: CloseableWorker;
  /** Snapshot semanal do Forecast (Comercial Inteligente) — já registrado em worker.ts; aqui para o modo embutido não ficar sem ele. */
  forecastSnapshotWorker: CloseableWorker;
  /** Transcrição de conversa do Copiloto IA (Onda 3) — mesmo raciocínio do forecastSnapshotWorker acima. */
  copilotoTranscriptionWorker: CloseableWorker;
  searchWorker: CloseableWorker;
  coldCallWorker: CloseableWorker;
  swarmSchedulerWorker: CloseableWorker;
}

/**
 * Cria (quando ENABLE_EMBEDDED_WORKERS + Redis habilitados) e agenda todos os workers/jobs
 * embutidos do processo HTTP. Gated por ENABLE_EMBEDDED_WORKERS: um BullMQ Worker (diferente de
 * uma Queue) conecta no Redis avidamente ao ser criado — sem Redis disponível, isso derruba o
 * processo. Isolado do processo `worker.ts` dedicado: só cria workers aqui se explícito, senão
 * eles rodam exclusivamente lá.
 *
 * Deve ser chamado depois de `app.listen(...)` (mesma posição do server.ts original) — os
 * workers não bloqueiam a porta HTTP subindo, e uma falha ao agendar um job individual é
 * capturada e logada (não derruba o processo), preservando o mesmo tratamento de falha do
 * server.ts original.
 */
export function startEmbeddedWorkers(): EmbeddedWorkersHandle {
  const embeddedWorkersEnabled = queuesEnabled && env.ENABLE_EMBEDDED_WORKERS;

  const handle: EmbeddedWorkersHandle = {
    leadsWorker: embeddedWorkersEnabled ? createLeadsWorker() : null,
    agentWorker: embeddedWorkersEnabled ? createAgentWorker() : null,
    enrichmentWorker: embeddedWorkersEnabled ? createEnrichmentWorker() : null,
    whatsappSignalWorker: embeddedWorkersEnabled ? createWhatsAppSignalWorker() : null,
    bitrixSyncWorker: embeddedWorkersEnabled ? createBitrixSyncWorker() : null,
    followUpWorker: embeddedWorkersEnabled ? createFollowUpWorker() : null,
    execSummaryWorker: embeddedWorkersEnabled ? createExecutiveSummaryWorker() : null,
    deduplicationWorker: embeddedWorkersEnabled ? createDeduplicationWorker() : null,
    winLossWorker: embeddedWorkersEnabled ? createWinLossAnalysisWorker() : null,
    pdfWorker: embeddedWorkersEnabled ? createWeeklyPdfReportWorker() : null,
    autoAnonymizeWorker: embeddedWorkersEnabled ? createAutoAnonymizeWorker() : null,
    coldLeadsScannerWorker: embeddedWorkersEnabled ? createColdLeadsScannerWorker() : null,
    stagnationScannerWorker: embeddedWorkersEnabled ? createStagnationScannerWorker() : null,
    accountIntelligenceSchedulerWorker: embeddedWorkersEnabled
      ? createAccountIntelligenceSchedulerWorker()
      : null,
    forecastSnapshotWorker: embeddedWorkersEnabled ? createForecastSnapshotWorker() : null,
    copilotoTranscriptionWorker: embeddedWorkersEnabled
      ? createCopilotoTranscriptionWorker()
      : null,
    searchWorker: null,
    coldCallWorker: null,
    swarmSchedulerWorker: null,
  };

  // Sem Redis, `.add()` chega a enfileirar o comando e falha ao dar baixa nas retries —
  // o próprio `.catch()` abaixo não é suficiente pra cobrir esse caminho interno do BullMQ,
  // que já causou uma promise rejection não tratada (derrubando o processo) mesmo com ele. O
  // guard global (`registerProcessGuards`, chamado no topo de server.ts) cobre esse caso residual.
  if (embeddedWorkersEnabled) {
    scheduleBitrixSync().catch((err) =>
      logger.error({ err }, 'Falha ao agendar a sincronização automática do Bitrix'),
    );
    scheduleFollowUpJobs().catch((err) =>
      logger.error({ err }, 'Falha ao agendar jobs de follow-up'),
    );
    scheduleExecutiveSummaryJob().catch((err) =>
      logger.error({ err }, 'Falha ao agendar job de summary executivo'),
    );
    scheduleDeduplicationJob().catch((err) =>
      logger.error({ err }, 'Falha ao agendar job de deduplicacao'),
    );
    scheduleWinLossAnalysisJob().catch((err) =>
      logger.error({ err }, 'Falha ao agendar job de win/loss analysis'),
    );
    scheduleWeeklyPdfReportJob().catch((err) =>
      logger.error({ err }, 'Falha ao agendar job do pdf semanal'),
    );
    scheduleAutoAnonymizeJob().catch((err) =>
      logger.error({ err }, 'Falha ao agendar job de anonimização automática'),
    );
    scheduleColdLeadsScannerJob().catch((err) =>
      logger.error({ err }, 'Falha ao agendar job do cold leads scanner'),
    );
    accountIntelligenceSchedulerQueue
      .upsertJobScheduler(
        'daily-ldr-scheduler',
        { pattern: '0 2 * * *' },
        { name: 'accountIntelligenceScheduler', data: {} },
      )
      .catch((err) => logger.error({ err }, 'Falha ao agendar job do LDR scheduler'));
    scheduleStagnationScannerJob().catch((err) =>
      logger.error({ err }, 'Falha ao agendar job do stagnation scanner'),
    );
    scheduleForecastSnapshotJob().catch((err) =>
      logger.error({ err }, 'Falha ao agendar o snapshot semanal de forecast'),
    );
  }

  handle.searchWorker = embeddedWorkersEnabled && env.ENABLE_SEARCH ? createSearchWorker() : null;
  if (queuesEnabled && env.ENABLE_SEARCH) {
    initMeiliIndexes().catch(() => logger.warn('Meilisearch offline'));
  }

  // Preenchidos de forma assíncrona (dependem de uma consulta ao banco para saber se alguma
  // organização tem a feature habilitada) — de propósito não bloqueiam o retorno desta função,
  // mesmo comportamento "fire and forget" do server.ts original.
  enabledOrganizations()
    .then((coldCallOrgs) => {
      handle.coldCallWorker =
        embeddedWorkersEnabled && coldCallOrgs.length > 0 ? createColdCallWorker() : null;
      if (handle.coldCallWorker) {
        scheduleColdCallCampaigns().catch((err) =>
          logger.error({ err }, 'Falha ao agendar a campanha de prospecção fria'),
        );
      }
    })
    .catch(() => null);

  swarmSchedulerEnabledOrganizations()
    .then((swarmOrgs) => {
      handle.swarmSchedulerWorker =
        embeddedWorkersEnabled && swarmOrgs.length > 0 ? createSwarmSchedulerWorker() : null;
      if (handle.swarmSchedulerWorker) {
        scheduleSwarmScheduler().catch((err) =>
          logger.error({ err }, 'Falha ao agendar o enxame autônomo'),
        );
      }
    })
    .catch(() => null);

  return handle;
}
