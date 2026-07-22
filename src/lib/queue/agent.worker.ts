import { Worker, Job } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { SDRAgent } from '../../features/intelligence/agents/sdr-agent.js';

export const AGENT_QUEUE_NAME = 'intelligence-agents';

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
                    const agent = new SDRAgent(`session_${job.data.payload.leadId}`);
                    await agent.draftEmailForLead(job.data.payload.leadId, job.data.payload.tenantId);
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
