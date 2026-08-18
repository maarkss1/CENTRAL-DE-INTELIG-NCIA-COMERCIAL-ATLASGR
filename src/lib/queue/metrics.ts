import client from 'prom-client';
import type { Queue } from 'bullmq';
import { logger } from '../logger.js';

interface RegisteredQueue {
    name: string;
    queue: Queue;
}

const registeredQueues: RegisteredQueue[] = [];

export function registerQueueForMetrics(name: string, queue: Queue | null | undefined): void {
    if (!queue) return;
    if (registeredQueues.some((entry) => entry.name === name)) return;
    registeredQueues.push({ name, queue });
}

async function collectDepthGauge(
    gauge: client.Gauge<'queue'>,
    getCount: (queue: Queue) => Promise<number>,
): Promise<void> {
    await Promise.all(
        registeredQueues.map(async ({ name, queue }) => {
            try {
                gauge.set({ queue: name }, await getCount(queue));
            } catch (err) {
                logger.warn({ err, queue: name }, 'Falha ao coletar métrica de fila');
            }
        }),
    );
}

export const bullmqQueueWaitingJobs = new client.Gauge({
    name: 'bullmq_queue_waiting_jobs',
    help: 'Jobs aguardando execução por fila BullMQ.',
    labelNames: ['queue'] as const,
    async collect() {
        await collectDepthGauge(this, (queue) => queue.getWaitingCount());
    },
});

export const bullmqQueueActiveJobs = new client.Gauge({
    name: 'bullmq_queue_active_jobs',
    help: 'Jobs em execução por fila BullMQ.',
    labelNames: ['queue'] as const,
    async collect() {
        await collectDepthGauge(this, (queue) => queue.getActiveCount());
    },
});

export const bullmqQueueFailedJobs = new client.Gauge({
    name: 'bullmq_queue_failed_jobs',
    help: 'Jobs falhados retidos por fila BullMQ.',
    labelNames: ['queue'] as const,
    async collect() {
        await collectDepthGauge(this, (queue) => queue.getFailedCount());
    },
});

export const bullmqQueueStalledJobs = new client.Gauge({
    name: 'bullmq_queue_stalled_jobs',
    help: 'Jobs stalled por fila BullMQ.',
    labelNames: ['queue'] as const,
    async collect() {
        await collectDepthGauge(this, (queue) => queue.getJobCountByTypes('stalled'));
    },
});

export const bullmqOldestWaitingJobAgeSeconds = new client.Gauge({
    name: 'bullmq_oldest_waiting_job_age_seconds',
    help: 'Idade em segundos do job waiting mais antigo por fila.',
    labelNames: ['queue'] as const,
    async collect() {
        await Promise.all(
            registeredQueues.map(async ({ name, queue }) => {
                try {
                    const [oldest] = await queue.getJobs(['waiting'], -1, -1, true);
                    const age = oldest?.timestamp ? Math.max(0, (Date.now() - oldest.timestamp) / 1000) : 0;
                    this.set({ queue: name }, age);
                } catch (err) {
                    logger.warn({ err, queue: name }, 'Falha ao coletar idade do job mais antigo');
                }
            }),
        );
    },
});

export const bullmqQueueCompletedJobs = new client.Counter({
    name: 'bullmq_queue_completed_jobs',
    help: 'Total acumulado de jobs concluídos por fila desde o boot.',
    labelNames: ['queue'] as const,
});

export const bullmqQueueRetryCount = new client.Counter({
    name: 'bullmq_queue_retry_count_total',
    help: 'Total de retries observados por fila desde o boot.',
    labelNames: ['queue'] as const,
});

export const workerProcessUp = new client.Gauge({
    name: 'atlas_worker_up',
    help: '1 quando o processo dedicado de workers terminou o bootstrap e está ativo.',
});

export const redisReconnectCount = new client.Counter({
    name: 'redis_reconnect_total',
    help: 'Total de tentativas de reconexão Redis por papel de conexão.',
    labelNames: ['role'] as const,
});

export function recordQueueJobCompleted(name: string): void {
    bullmqQueueCompletedJobs.inc({ queue: name });
}

export function recordQueueRetry(name: string): void {
    bullmqQueueRetryCount.inc({ queue: name });
}

export function setWorkerProcessUp(up: boolean): void {
    workerProcessUp.set(up ? 1 : 0);
}

export function recordRedisReconnect(role: string): void {
    redisReconnectCount.inc({ role });
}
