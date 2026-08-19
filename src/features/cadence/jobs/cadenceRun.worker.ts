import { Worker, Queue, type Job } from 'bullmq';
import { prisma } from '../../../lib/prisma.js';
import { requestContext } from '../../../lib/async-context.js';
import { logger } from '../../../lib/logger.js';
import { connection } from '../../../lib/queue/redis.js';
import { recordDeadLetter, isFinalAttempt } from '../../../lib/queue/deadLetter.js';
import { isWithinCallWindow } from '../../integrations/birth-voice/coldCall.policy.js';
import { advanceCadenceRun, type AdvanceCadenceRunDeps } from '../application/cadenceService.js';
import { validateSequence, type CadenceChannel, type CadenceSequenceDefinition, type CadenceTouch } from '../domain/cadence.js';
import { prismaCadenceRunRepository } from '../infra/PrismaCadenceRunRepository.js';
import { prismaOptOutRepository } from '../infra/PrismaOptOutRepository.js';
import { prismaLeadSubjectResolver } from '../infra/PrismaLeadSubjectResolver.js';
import { hasLeadReplied } from '../infra/hasLeadReplied.js';
import { productionCadenceDispatcher } from '../infra/dispatchers/CadenceDispatchers.js';
import { redisCadenceRunLock } from '../infra/RedisCadenceRunLock.js';

/**
 * Runtime real da cadência multicanal (CYC-008, onda-19) — até aqui `advanceCadenceRun` (domínio
 * puro, Onda 10) só era chamado por teste; nenhum worker/scheduler existia. Este arquivo é o que
 * falta para uma `CadenceRun` ativa de fato avançar sozinha.
 *
 * Mesmo padrão de `followUp.worker.ts`/`bitrixSync.worker.ts`: varredura cross-tenant sem
 * `requestContext.run` (segue o precedente já em produção — RLS sem tenant setado é o modo usado
 * hoje por todo job em lote que precisa enxergar mais de uma organização por tick), BullMQ
 * `Worker` + `Queue.upsertJobScheduler` para o agendamento recorrente (BullMQ v6 não tem mais
 * `repeat` em `Queue.add`).
 *
 * Limitação conhecida (ver `docs/CADENCE-CYCLE-AUDIT.md`): não existe ainda nenhuma rota/UI para
 * criar uma `CadenceSequence` ou iniciar uma `CadenceRun` — este worker fica correto, mas ocioso,
 * até essa decisão de produto (quem inicia uma cadência, e com que conteúdo) ser tomada.
 */

export const CADENCE_RUN_QUEUE_NAME = 'cadence-run-scanner';
const SCAN_INTERVAL_MS = 5 * 60 * 1000;
const MAX_RUNS_PER_TICK = 500;

const VALID_CHANNELS: CadenceChannel[] = ['email', 'whatsapp', 'voice'];

function isCadenceTouch(value: unknown): value is CadenceTouch {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.order === 'number' &&
        typeof v.channel === 'string' &&
        VALID_CHANNELS.includes(v.channel as CadenceChannel) &&
        typeof v.delayHoursFromPrevious === 'number' &&
        (v.maxAttempts === undefined || typeof v.maxAttempts === 'number') &&
        (v.templateRef === undefined || v.templateRef === null || typeof v.templateRef === 'string')
    );
}

/** `CadenceSequence.touches` é `Json` no schema — sem validação em runtime, um registro malformado quebraria o scan inteiro. Nunca lança: registro inválido é pulado e logado. */
export function parseCadenceSequenceDefinition(row: { id: string; name: string; touches: unknown }): CadenceSequenceDefinition | null {
    if (!Array.isArray(row.touches) || !row.touches.every(isCadenceTouch)) {
        logger.error({ sequenceId: row.id }, 'CadenceSequence.touches malformado — sequência ignorada nesta varredura.');
        return null;
    }
    const sequence: CadenceSequenceDefinition = { id: row.id, name: row.name, touches: row.touches };
    const errors = validateSequence(sequence);
    if (errors.length > 0) {
        logger.error({ sequenceId: row.id, errors }, 'CadenceSequence inválida — sequência ignorada nesta varredura.');
        return null;
    }
    return sequence;
}

function buildDeps(): AdvanceCadenceRunDeps {
    return {
        runRepo: prismaCadenceRunRepository,
        optOutRepo: prismaOptOutRepository,
        subjectResolver: prismaLeadSubjectResolver,
        dispatcher: productionCadenceDispatcher,
        lock: redisCadenceRunLock,
        isWithinBusinessWindow: (now) => isWithinCallWindow(now),
        hasLeadReplied,
    };
}

/**
 * Varre os `CadenceRun` ativos e chama `advanceCadenceRun` para cada um. Exportado à parte do
 * worker BullMQ (mesmo padrão de `runColdLeadsScan`) para permitir teste de integração direto,
 * sem esperar o tick da fila. Uma falha em UM run é isolada e logada — nunca aborta o restante da
 * varredura.
 */
export async function scanAndAdvanceCadenceRuns(now: Date = new Date()): Promise<{ processed: number; errors: number; skippedInvalidSequence: number }> {
    // Descoberta cross-tenant: nenhum organizationId conhecido ainda, então precisa do bypass de RLS
    // (só liberado para os models CadenceRun/CadenceSequence — ver comentário em src/lib/prisma.ts).
    // A partir daqui, cada run é processado com o tenant real escopado — nunca com bypass.
    const { activeRuns, sequences } = await requestContext.run({ bypassRls: true }, async () => {
        const runs = await prisma.cadenceRun.findMany({
            where: { status: 'Active' },
            select: { id: true, organizationId: true, sequenceId: true },
            take: MAX_RUNS_PER_TICK,
        });

        if (runs.length === 0) return { activeRuns: runs, sequences: new Map<string, CadenceSequenceDefinition | null>() };

        const sequenceIds = [...new Set(runs.map((r) => r.sequenceId))];
        const sequenceRows = await prisma.cadenceSequence.findMany({
            where: { id: { in: sequenceIds } },
            select: { id: true, name: true, touches: true },
        });
        const seqMap = new Map<string, CadenceSequenceDefinition | null>();
        for (const row of sequenceRows) seqMap.set(row.id, parseCadenceSequenceDefinition(row));
        return { activeRuns: runs, sequences: seqMap };
    });

    if (activeRuns.length === 0) return { processed: 0, errors: 0, skippedInvalidSequence: 0 };

    const deps = buildDeps();
    let processed = 0;
    let errors = 0;
    let skippedInvalidSequence = 0;

    for (const run of activeRuns) {
        const sequence = sequences.get(run.sequenceId);
        if (!sequence) {
            skippedInvalidSequence++;
            continue;
        }
        try {
            await requestContext.run({ tenantId: run.organizationId }, () =>
                advanceCadenceRun(deps, run.organizationId, run.id, sequence, now),
            );
            processed++;
        } catch (err) {
            errors++;
            logger.error({ err, organizationId: run.organizationId, runId: run.id }, 'Falha ao avançar CadenceRun nesta varredura.');
        }
    }

    logger.info({ activeRuns: activeRuns.length, processed, errors, skippedInvalidSequence }, 'Varredura de cadência concluída.');
    return { processed, errors, skippedInvalidSequence };
}

export function createCadenceRunWorker(): Worker {
    const worker = new Worker(
        CADENCE_RUN_QUEUE_NAME,
        async (_job: Job) => {
            await scanAndAdvanceCadenceRuns();
        },
        { connection: connection as any, concurrency: 1 },
    );

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Cadence run worker job falhou');
        if (!job || !isFinalAttempt(job.attemptsMade, job.opts.attempts)) return;
        void recordDeadLetter({ queue: CADENCE_RUN_QUEUE_NAME, jobId: job.id, jobName: job.name, attemptsMade: job.attemptsMade, error: err });
    });

    worker.on('error', (err) => {
        logger.warn({ err }, 'Cadence run worker error suppressed (Redis offline)');
    });

    return worker;
}

export async function scheduleCadenceRunJob(): Promise<void> {
    const queue = new Queue(CADENCE_RUN_QUEUE_NAME, { connection: connection as any });
    await queue.upsertJobScheduler('cadence-run-tick', { every: SCAN_INTERVAL_MS }, { name: 'scan-cadence-runs', data: {} });
    logger.info({ everyMs: SCAN_INTERVAL_MS }, 'Cadence run scan job scheduled');
}
