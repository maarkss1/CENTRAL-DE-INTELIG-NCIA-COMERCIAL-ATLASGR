import { Worker, Job, Queue } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { requestContext } from '../async-context.js';
import { SDROutboundDraftAgent } from '../../features/intelligence/agents/sdr-agent.js';
import { registerQueueForMetrics, recordQueueJobCompleted } from './metrics.js';

export const AGENT_QUEUE_NAME = 'intelligence-agents';
export const agentQueue = new Queue(AGENT_QUEUE_NAME, { connection });
agentQueue.on('error', (err) => logger.warn({ message: err.message }, 'agentQueue offline'));
registerQueueForMetrics(AGENT_QUEUE_NAME, agentQueue);

export interface AgentJobData {
    agentType: 'SDR_OUTBOUND';
    payload: {
        leadId: string;
        tenantId: string;
        /** Só true após as travas do scheduler (opt-in, score mínimo e janela comercial). */
        autoExecute: boolean;
    };
}

/**
 * Liga o produtor que faltava ao worker de SDR outbound. O job permanece por sete dias depois de
 * concluído, evitando que o scheduler de 15 minutos gere o mesmo primeiro contato repetidamente;
 * a chave de idempotência no banco é a segunda trava, permanente.
 */
export async function enqueueSdrOutboundDraft(
    leadId: string,
    tenantId: string,
    autoExecute: boolean,
): Promise<string | undefined> {
    const job = await agentQueue.add(
        'draft-first-contact',
        { agentType: 'SDR_OUTBOUND', payload: { leadId, tenantId, autoExecute } },
        {
            jobId: `sdr-outbound-${tenantId}-${leadId}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: { age: 7 * 24 * 60 * 60 },
            removeOnFail: { age: 30 * 24 * 60 * 60 },
        },
    );
    return job.id;
}

export function createAgentWorker() {
    const worker = new Worker<AgentJobData>(
        AGENT_QUEUE_NAME,
        async (job: Job<AgentJobData>) => {
            logger.info({ jobId: job.id, agentType: job.data.agentType }, 'Processing agent job');

            try {
                if (job.data.agentType === 'SDR_OUTBOUND') {
                    const { leadId, tenantId, autoExecute } = job.data.payload;
                    // Mesmo padrão de enrich.worker.ts: este worker roda fora de uma requisição
                    // HTTP, então sem isto nenhuma operação de model aqui carrega o
                    // app.current_tenant_id que a RLS depende — o create() de AIPendingAction (que
                    // usa RETURNING) seria rejeitado pela política assim que RLS estiver realmente
                    // ativa (ver getTenantId() em AgentService, usado como fallback do
                    // organizationId passado explícito abaixo).
                    await requestContext.run({ tenantId }, async () => {
                        const agent = new SDROutboundDraftAgent(`session_${leadId}`, tenantId);
                        const result = await agent.draftEmailForLead(leadId, tenantId, autoExecute);
                        logger.info({ jobId: job.id, leadId, ...result }, 'SDR outbound job completed');
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

    worker.on('completed', () => recordQueueJobCompleted(AGENT_QUEUE_NAME));

    return worker;
}
