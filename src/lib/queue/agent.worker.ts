import { Worker, Job, Queue } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { requestContext } from '../async-context.js';
import { SDROutboundDraftAgent } from '../../features/intelligence/agents/sdr-agent.js';

export const AGENT_QUEUE_NAME = 'intelligence-agents';
export const agentQueue = new Queue(AGENT_QUEUE_NAME, { connection });
agentQueue.on('error', (err) => logger.warn({ message: err.message }, 'agentQueue offline'));

interface AgentJobData {
    agentType: 'SDR_OUTBOUND';
    payload: {
        leadId: string;
        tenantId: string;
    };
}

export function createAgentWorker() {
    const worker = new Worker<AgentJobData>(
        AGENT_QUEUE_NAME,
        async (job: Job<AgentJobData>) => {
            logger.info({ jobId: job.id, agentType: job.data.agentType }, 'Processing agent job');

            try {
                if (job.data.agentType === 'SDR_OUTBOUND') {
                    const { leadId, tenantId } = job.data.payload;
                    // Mesmo padrão de enrich.worker.ts: este worker roda fora de uma requisição
                    // HTTP, então sem isto nenhuma operação de model aqui carrega o
                    // app.current_tenant_id que a RLS depende — o create() de AIPendingAction (que
                    // usa RETURNING) seria rejeitado pela política assim que RLS estiver realmente
                    // ativa (ver getTenantId() em AgentService, usado como fallback do
                    // organizationId passado explícito abaixo).
                    await requestContext.run({ tenantId }, async () => {
                        const agent = new SDROutboundDraftAgent(`session_${leadId}`, tenantId);
                        await agent.draftEmailForLead(leadId, tenantId);
                    });
                }
            } catch (error) {
                logger.error({ err: error, jobId: job.id }, 'Agent job failed');
                throw error;
            }
        },
        { connection, concurrency: 5 }
    );

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Worker job permanently failed');
    });

    return worker;
}
