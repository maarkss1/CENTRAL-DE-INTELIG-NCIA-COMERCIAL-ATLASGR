import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import client from 'prom-client';

vi.mock('../../../../src/lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/**
 * Handoff: .agents/handoffs/onda-4/10-para-07-metricas-fila-orcamento-ia.md — o Agente 10 escreveu
 * regras de alerta (infrastructure/observability/alert.rules.yml) contra
 * bullmq_queue_waiting_jobs/active_jobs/completed_jobs, que não existiam até este módulo. Estes
 * testes comprovam que os Gauges/Counter realmente ficam populados sob carga simulada, não só que
 * o módulo importa sem lançar.
 */
describe('src/lib/queue/metrics.ts', () => {
    beforeEach(() => {
        client.register.clear();
    });

    afterEach(() => {
        vi.resetModules();
        client.register.clear();
    });

    it('reports real waiting/active/failed counts per registered queue on collect', async () => {
        const { registerQueueForMetrics, bullmqQueueWaitingJobs, bullmqQueueActiveJobs, bullmqQueueFailedJobs } =
            await import('../../../../src/lib/queue/metrics.js');

        const fakeQueue = {
            getWaitingCount: vi.fn().mockResolvedValue(7),
            getActiveCount: vi.fn().mockResolvedValue(2),
            getFailedCount: vi.fn().mockResolvedValue(1),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        registerQueueForMetrics('test-queue', fakeQueue);

        const metrics = await client.register.getMetricsAsJSON();
        const waiting = metrics.find((m) => m.name === 'bullmq_queue_waiting_jobs');
        const active = metrics.find((m) => m.name === 'bullmq_queue_active_jobs');
        const failed = metrics.find((m) => m.name === 'bullmq_queue_failed_jobs');

        expect(fakeQueue.getWaitingCount).toHaveBeenCalled();
        expect(fakeQueue.getActiveCount).toHaveBeenCalled();
        expect(fakeQueue.getFailedCount).toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((waiting as any)?.values).toEqual(
            expect.arrayContaining([expect.objectContaining({ value: 7, labels: { queue: 'test-queue' } })]),
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((active as any)?.values).toEqual(
            expect.arrayContaining([expect.objectContaining({ value: 2, labels: { queue: 'test-queue' } })]),
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((failed as any)?.values).toEqual(
            expect.arrayContaining([expect.objectContaining({ value: 1, labels: { queue: 'test-queue' } })]),
        );

        void bullmqQueueWaitingJobs;
        void bullmqQueueActiveJobs;
        void bullmqQueueFailedJobs;
    });

    it('ignores a null/undefined queue (Redis não configurado) instead of throwing at scrape time', async () => {
        const { registerQueueForMetrics } = await import('../../../../src/lib/queue/metrics.js');

        expect(() => registerQueueForMetrics('disabled-queue', null)).not.toThrow();
        await expect(client.register.getMetricsAsJSON()).resolves.toBeDefined();
    });

    it('does not let one failing queue scrape break metrics for the others', async () => {
        const { registerQueueForMetrics } = await import('../../../../src/lib/queue/metrics.js');

        const brokenQueue = {
            getWaitingCount: vi.fn().mockRejectedValue(new Error('Redis offline')),
            getActiveCount: vi.fn().mockRejectedValue(new Error('Redis offline')),
            getFailedCount: vi.fn().mockRejectedValue(new Error('Redis offline')),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        const healthyQueue = {
            getWaitingCount: vi.fn().mockResolvedValue(3),
            getActiveCount: vi.fn().mockResolvedValue(0),
            getFailedCount: vi.fn().mockResolvedValue(0),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        registerQueueForMetrics('broken-queue', brokenQueue);
        registerQueueForMetrics('healthy-queue', healthyQueue);

        const metrics = await client.register.getMetricsAsJSON();
        const waiting = metrics.find((m) => m.name === 'bullmq_queue_waiting_jobs');
        expect((waiting as unknown as { values: Array<{ value: number; labels: { queue: string } }> })?.values).toEqual(
            expect.arrayContaining([expect.objectContaining({ value: 3, labels: { queue: 'healthy-queue' } })]),
        );
    });

    it('increments a monotonic counter of completed jobs per queue', async () => {
        const { recordQueueJobCompleted } = await import('../../../../src/lib/queue/metrics.js');

        recordQueueJobCompleted('completion-queue');
        recordQueueJobCompleted('completion-queue');
        recordQueueJobCompleted('other-queue');

        const metrics = await client.register.getMetricsAsJSON();
        const completed = metrics.find((m) => m.name === 'bullmq_queue_completed_jobs');
        expect((completed as unknown as { values: Array<{ value: number; labels: { queue: string } }> })?.values).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ value: 2, labels: { queue: 'completion-queue' } }),
                expect.objectContaining({ value: 1, labels: { queue: 'other-queue' } }),
            ]),
        );
    });
});
