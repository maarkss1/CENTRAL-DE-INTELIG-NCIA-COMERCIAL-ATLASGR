import { Queue, Worker, Job } from 'bullmq';
import { connection, queuesEnabled } from './redis.js';
import { logger } from '../logger.js';
import { analyzeConversation } from '../../features/integrations/whatsapp/conversation-intelligence.service.js';
import { registerQueueForMetrics, recordQueueJobCompleted } from './metrics.js';
import { recordDeadLetter, isFinalAttempt } from './deadLetter.js';

export const WHATSAPP_SIGNAL_QUEUE_NAME = 'whatsapp-conversation-signal';

// Tempo de silêncio antes de ler a conversa: uma troca de mensagens real acontece em rajada (2-3
// respostas em poucos minutos) — analisar a cada mensagem individual gastaria uma chamada de IA por
// mensagem e leria a conversa incompleta a cada vez. Debounce por lead: cada mensagem nova adia a
// análise em vez de disparar mais uma.
const DEBOUNCE_MS = 3 * 60 * 1000;

interface WhatsAppSignalJobData {
    leadId: string;
    organizationId: string;
}

export const whatsappSignalQueue = queuesEnabled
    ? new Queue<WhatsAppSignalJobData>(WHATSAPP_SIGNAL_QUEUE_NAME, { connection })
    : null;
whatsappSignalQueue?.on('error', (err) => logger.warn({ message: err.message }, 'whatsappSignalQueue offline'));
registerQueueForMetrics(WHATSAPP_SIGNAL_QUEUE_NAME, whatsappSignalQueue);

/**
 * (Re)agenda a leitura da conversa deste lead, adiando `DEBOUNCE_MS` a partir de agora.
 *
 * Debounce real: se já existe um job pendente (ainda não começou a rodar) para o mesmo lead, ele é
 * removido e substituído por um novo com o atraso resetado — assim uma sequência de mensagens só
 * gera UMA análise, no fim da troca, em vez de uma por mensagem. Um job já "active" (lendo o banco
 * agora) é deixado em paz; se chegar mensagem nova nesse meio-tempo, a próxima chamada agenda outra
 * rodada normalmente.
 */
export async function scheduleConversationAnalysis(leadId: string, organizationId: string): Promise<void> {
    if (!whatsappSignalQueue) return;
    const jobId = `conversation-signal:${leadId}`;

    try {
        const existing = await whatsappSignalQueue.getJob(jobId);
        if (existing) {
            const state = await existing.getState();
            if (state === 'delayed' || state === 'waiting') {
                await existing.remove().catch(() => {});
            }
        }

        await whatsappSignalQueue.add(
            'analyze-conversation',
            { leadId, organizationId },
            { jobId, delay: DEBOUNCE_MS, removeOnComplete: true, attempts: 1 },
        );
    } catch (error) {
        // Best-effort: se o Redis estiver indisponível, a mensagem já foi persistida (o que importa
        // não se perde) — só a leitura por IA desta rodada fica pra próxima mensagem.
        logger.warn({ err: error, leadId }, 'Não foi possível agendar a análise de conversa do WhatsApp');
    }
}

export function createWhatsAppSignalWorker() {
    const worker = new Worker<WhatsAppSignalJobData>(
        WHATSAPP_SIGNAL_QUEUE_NAME,
        async (job: Job<WhatsAppSignalJobData>) => {
            await analyzeConversation(job.data.leadId, job.data.organizationId);
        },
        { connection, concurrency: 3 },
    );

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id, leadId: job?.data.leadId }, 'Falha ao analisar conversa de WhatsApp');
        if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
        void recordDeadLetter({
            queue: WHATSAPP_SIGNAL_QUEUE_NAME,
            jobId: job.id,
            jobName: job.name,
            organizationId: job.data?.organizationId ?? null,
            attemptsMade: job.attemptsMade,
            error: err,
            data: job.data,
        });
    });

    worker.on('completed', () => recordQueueJobCompleted(WHATSAPP_SIGNAL_QUEUE_NAME));

    return worker;
}
