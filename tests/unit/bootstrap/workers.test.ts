import { describe, it, expect, vi, beforeEach } from 'vitest';

const { workerStub } = vi.hoisted(() => ({
    workerStub: () => ({ close: vi.fn() }),
}));

vi.mock('../../../src/config/env.js', () => ({
    env: { ENABLE_EMBEDDED_WORKERS: false, ENABLE_SEARCH: false },
}));
vi.mock('../../../src/lib/queue/redis.js', () => ({ queuesEnabled: true }));
vi.mock('../../../src/lib/logger.js', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), fatal: vi.fn() },
}));
vi.mock('../../../src/lib/queue/index.js', () => ({ createLeadsWorker: vi.fn(workerStub) }));
vi.mock('../../../src/lib/queue/agent.worker.js', () => ({ createAgentWorker: vi.fn(workerStub), agentQueue: {} }));
vi.mock('../../../src/lib/queue/enrichment.queue.js', () => ({ createEnrichmentWorker: vi.fn(workerStub) }));
vi.mock('../../../src/lib/queue/search.queue.js', () => ({ createSearchWorker: vi.fn(workerStub), searchQueue: {} }));
vi.mock('../../../src/lib/search/index.js', () => ({ initMeiliIndexes: vi.fn(async () => undefined) }));
vi.mock('../../../src/lib/queue/coldCall.worker.js', () => ({
    createColdCallWorker: vi.fn(workerStub),
    scheduleColdCallCampaigns: vi.fn(async () => undefined),
}));
vi.mock('../../../src/lib/queue/whatsappSignal.worker.js', () => ({ createWhatsAppSignalWorker: vi.fn(workerStub) }));
vi.mock('../../../src/features/integrations/birth-voice/coldCall.service.js', () => ({
    enabledOrganizations: vi.fn(async () => []),
}));
vi.mock('../../../src/lib/queue/swarmScheduler.worker.js', () => ({
    createSwarmSchedulerWorker: vi.fn(workerStub),
    scheduleSwarmScheduler: vi.fn(async () => undefined),
}));
vi.mock('../../../src/features/intelligence/services/swarmScheduler.service.js', () => ({
    enabledOrganizations: vi.fn(async () => []),
}));
vi.mock('../../../src/lib/queue/bitrixSync.worker.js', () => ({
    createBitrixSyncWorker: vi.fn(workerStub),
    scheduleBitrixSync: vi.fn(async () => undefined),
}));
vi.mock('../../../src/features/crm/jobs/followUp.worker.js', () => ({
    createFollowUpWorker: vi.fn(workerStub),
    scheduleFollowUpJobs: vi.fn(async () => undefined),
}));
vi.mock('../../../src/features/crm/jobs/dailyExecutiveSummary.worker.js', () => ({
    createExecutiveSummaryWorker: vi.fn(workerStub),
    scheduleExecutiveSummaryJob: vi.fn(async () => undefined),
}));
vi.mock('../../../src/features/crm/jobs/deduplication.worker.js', () => ({
    createDeduplicationWorker: vi.fn(workerStub),
    scheduleDeduplicationJob: vi.fn(async () => undefined),
}));
vi.mock('../../../src/features/intelligence/services/winLossAnalysis.worker.js', () => ({
    createWinLossAnalysisWorker: vi.fn(workerStub),
    scheduleWinLossAnalysisJob: vi.fn(async () => undefined),
}));
vi.mock('../../../src/features/crm/jobs/weeklyPdfReport.worker.js', () => ({
    createWeeklyPdfReportWorker: vi.fn(workerStub),
    scheduleWeeklyPdfReportJob: vi.fn(async () => undefined),
}));
vi.mock('../../../src/features/crm/jobs/autoAnonymizeDisqualified.worker.js', () => ({
    createAutoAnonymizeWorker: vi.fn(workerStub),
    scheduleAutoAnonymizeJob: vi.fn(async () => undefined),
}));
vi.mock('../../../src/features/automations/application/cold-leads-scanner.service.js', () => ({
    createColdLeadsScannerWorker: vi.fn(workerStub),
    scheduleColdLeadsScannerJob: vi.fn(async () => undefined),
}));
vi.mock('../../../src/features/automations/application/stagnation-scanner.service.js', () => ({
    createStagnationScannerWorker: vi.fn(workerStub),
    scheduleStagnationScannerJob: vi.fn(async () => undefined),
}));

import { startEmbeddedWorkers } from '../../../src/bootstrap/workers.js';
import { createLeadsWorker } from '../../../src/lib/queue/index.js';

describe('bootstrap/workers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('não cria nenhum worker embutido quando ENABLE_EMBEDDED_WORKERS=false', () => {
        const handle = startEmbeddedWorkers();

        expect(handle.leadsWorker).toBeNull();
        expect(handle.agentWorker).toBeNull();
        expect(handle.searchWorker).toBeNull();
        expect(createLeadsWorker).not.toHaveBeenCalled();
    });

    it('coldCallWorker/swarmSchedulerWorker começam nulos de forma síncrona (populados depois, de forma assíncrona)', () => {
        const handle = startEmbeddedWorkers();

        expect(handle.coldCallWorker).toBeNull();
        expect(handle.swarmSchedulerWorker).toBeNull();
    });
});
