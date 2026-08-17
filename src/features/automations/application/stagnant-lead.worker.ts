import { Worker, Queue } from 'bullmq';
import { connection } from '../../../lib/queue/redis.js';
import { logger } from '../../../lib/logger.js';
import { prisma } from '../../../lib/prisma.js';
import { requestContext } from '../../../lib/async-context.js';
import { automationEngine } from './../automation.engine.js';
import { fromPrismaLeadStatus } from '../../../lib/enumMap.js';

export const STAGNANT_LEAD_QUEUE_NAME = 'stagnant-lead-queue';

export async function runStagnantLeadScan(): Promise<void> {
    logger.info('StagnantLead scan iniciada.');

    try {
        const organizations = await prisma.organization.findMany({ select: { id: true } });

        for (const { id: organizationId } of organizations) {
            const now = new Date();
            await requestContext.run({ tenantId: organizationId }, async () => {
                const candidates = await prisma.automation.findMany({
                    where: { organizationId, enabled: true, trigger: 'Lead_Sem_Interacao' as never },
                });

                for (const automation of candidates) {
                    const daysCondition = typeof automation.conditions === 'object' && automation.conditions !== null && 'daysSinceLastInteraction' in automation.conditions
                        ? (automation.conditions as any).daysSinceLastInteraction?.gte
                        : null;
                    
                    const days = typeof daysCondition === 'number' ? daysCondition : 3;

                    try {
                        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

                        const leads = await prisma.lead.findMany({
                            where: {
                                organizationId,
                                deletedAt: null,
                                status: { notIn: ['Negocios_Ganhos', 'Negocios_Perdidos', 'Lead_Desqualificado'] },
                                OR: [
                                    { lastInteraction: { lte: cutoff } },
                                    { lastInteraction: null, createdAt: { lte: cutoff } },
                                ],
                            },
                            select: { id: true, status: true, owner: true, temperature: true, score: true, lastInteraction: true, createdAt: true },
                        });

                        for (const lead of leads) {
                            const referenceDate = lead.lastInteraction ?? lead.createdAt;
                            const daysSince = Math.floor((now.getTime() - referenceDate.getTime()) / (24 * 60 * 60 * 1000));
                            const streakKey = lead.lastInteraction ? lead.lastInteraction.toISOString() : 'never';

                            await automationEngine.handle({
                                organizationId,
                                trigger: 'Lead sem interação' as never,
                                entity: 'Lead',
                                entityId: lead.id,
                                data: {
                                    status: fromPrismaLeadStatus(lead.status),
                                    owner: lead.owner,
                                    temperature: lead.temperature,
                                    score: lead.score,
                                    daysSinceLastInteraction: daysSince,
                                    streakKey,
                                },
                            });
                        }
                    } catch (err) {
                        logger.error({ err, organizationId, automationId: automation.id }, 'Falha ao reavaliar automacao de lead sem interacao');
                    }
                }
            });
        }
        logger.info('StagnantLead scan concluída.');
    } catch (error) {
        logger.error({ err: error }, 'StagnantLead scan falhou.');
    }
}

export function createStagnantLeadWorker() {
    const worker = new Worker(STAGNANT_LEAD_QUEUE_NAME, async (job) => {
        logger.info('Iniciando job de stagnant-lead');
        await runStagnantLeadScan();
    }, {
        connection: connection as any,
        concurrency: 1
    });

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'StagnantLead worker job falhou');
    });

    worker.on('error', (err) => {
        logger.warn({ err }, 'StagnantLead worker error suppressed (Redis offline)');
    });

    return worker;
}

export async function scheduleStagnantLeadJob() {
    const queue = new Queue(STAGNANT_LEAD_QUEUE_NAME, {
        connection: connection as any
    });
    
    await queue.upsertJobScheduler('daily-stagnant-lead-scan', { pattern: '0 4 * * *' }, {
        name: 'daily-stagnant-lead-scan',
        data: {},
    });
    
    logger.info('StagnantLead job scheduled');
}
