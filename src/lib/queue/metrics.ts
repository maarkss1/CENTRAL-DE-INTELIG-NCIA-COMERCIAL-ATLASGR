import client from 'prom-client';
import type { Queue } from 'bullmq';
import { logger } from '../logger.js';

/**
 * Métricas Prometheus de profundidade/conclusão de fila BullMQ, expostas em `/metrics`
 * (montado condicionalmente por `EXPOSE_METRICS` em server.ts, que já chama
 * `client.collectDefaultMetrics()`).
 *
 * Handoff: .agents/handoffs/onda-4/10-para-07-metricas-fila-orcamento-ia.md — o Agente 10
 * (Infra/SRE) já escreveu regras de alerta em infrastructure/observability/alert.rules.yml
 * (grupo `prospector-atlas.filas.pendente-instrumentacao`) que referenciam
 * `bullmq_queue_waiting_jobs`/`bullmq_queue_active_jobs`/`bullmq_queue_completed_jobs` como um
 * contrato de nome de métrica — este arquivo é quem passa a produzi-las de fato.
 *
 * `bullmq_queue_completed_jobs` é um Counter (não um Gauge amostrado de
 * `queue.getCompletedCount()`): BullMQ poda jobs completados retidos (removeOnComplete), então o
 * valor de `getCompletedCount()` pode CAIR ao longo do tempo — usado com `rate()` (como a regra
 * `QueueStalled` faz) isso produziria taxas artificialmente negativas/zeradas sem relação com
 * conclusões reais. Um Counter incrementado por evento 'completed' do Worker é monotônico e correto
 * sob `rate()`. Reinicia (como todo Counter em memória de processo) a cada boot — comportamento
 * esperado do Prometheus, que trata resets de contador nativamente.
 */

interface RegisteredQueue {
    name: string;
    queue: Queue;
}

const registeredQueues: RegisteredQueue[] = [];

/**
 * Registra uma fila para ser amostrada pelos Gauges de profundidade abaixo. Filas desabilitadas
 * (Redis não configurado — `queue` é `null`) são ignoradas: nada para expor, e chamar
 * `getWaitingCount()` etc. numa conexão que já esgotou retries lançaria a cada scrape.
 */
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
                const count = await getCount(queue);
                gauge.set({ queue: name }, count);
            } catch (err) {
                // Uma fila temporariamente sem Redis não deve derrubar o /metrics inteiro nem
                // as demais séries — só essa amostra fica ausente/desatualizada neste scrape.
                logger.warn({ err, queue: name }, 'Falha ao coletar métrica de profundidade de fila');
            }
        }),
    );
}

export const bullmqQueueWaitingJobs = new client.Gauge({
    name: 'bullmq_queue_waiting_jobs',
    help: 'Jobs aguardando execução por fila BullMQ (Queue.getWaitingCount).',
    labelNames: ['queue'] as const,
    async collect() {
        await collectDepthGauge(this, (queue) => queue.getWaitingCount());
    },
});

export const bullmqQueueActiveJobs = new client.Gauge({
    name: 'bullmq_queue_active_jobs',
    help: 'Jobs em execução por fila BullMQ (Queue.getActiveCount).',
    labelNames: ['queue'] as const,
    async collect() {
        await collectDepthGauge(this, (queue) => queue.getActiveCount());
    },
});

export const bullmqQueueFailedJobs = new client.Gauge({
    name: 'bullmq_queue_failed_jobs',
    help: 'Jobs falhados retidos por fila BullMQ (Queue.getFailedCount) — sinal complementar de fila travada além do waiting/active.',
    labelNames: ['queue'] as const,
    async collect() {
        await collectDepthGauge(this, (queue) => queue.getFailedCount());
    },
});

export const bullmqQueueCompletedJobs = new client.Counter({
    name: 'bullmq_queue_completed_jobs',
    help: 'Total acumulado (desde o boot do processo) de jobs concluídos com sucesso por fila BullMQ.',
    labelNames: ['queue'] as const,
});

/** Chamado pelo listener 'completed' de cada Worker registrado em src/lib/queue/**. */
export function recordQueueJobCompleted(name: string): void {
    bullmqQueueCompletedJobs.inc({ queue: name });
}
