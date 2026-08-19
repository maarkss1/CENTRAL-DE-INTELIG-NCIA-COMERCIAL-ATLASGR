import { prisma } from '../../../lib/prisma.js';
import type { CadenceRunListFilter, CadenceRunRepository } from '../application/cadenceService.js';
import type {
    CadenceChannel,
    CadenceRunState,
    CadenceRunStatus,
    CadenceSkipReason,
    CadenceStopReason,
    CadenceTouchAttempt,
    CadenceTouchResult,
} from '../domain/cadence.js';

/**
 * Adaptador Prisma real de `CadenceRunRepository` (tabelas `CadenceRun`/`CadenceTouchAttempt`, ver
 * `prisma/schema.prisma` §"Cadência multicanal" e migration da Onda 9/PR #132). Mesmo padrão de
 * `PrismaOptOutRepository.ts`: enum Postgres PascalCase mapeado para o domínio lowercase/kebab
 * aqui, nunca propagado cru pro resto do código.
 *
 * Antes deste arquivo, a única implementação real da porta era `InMemoryCadenceRunRepository`
 * (só para teste) — sem isto, nem o scheduler de cadência nem `GET /api/cadence/runs`
 * (`cadence.routes.ts`) tinham como ler/gravar um run de verdade.
 *
 * `save()` é upsert: cria o `CadenceRun` na primeira chamada (`startCadenceRun`) e atualiza nas
 * seguintes. `CadenceRunState.attempts` é sempre o histórico completo do run (o domínio só
 * acrescenta, nunca remove/reordena — ver `recordTouchAttempt` em `domain/cadence.ts`), então
 * gravar de novo o array inteiro a cada `save()` gravaria duplicata; em vez disso, contamos quantas
 * tentativas já existem no banco para este run e persistimos só a cauda nova. A leitura + upsert +
 * inserção da cauda roda numa única transação para não deixar o `CadenceRun` e seu
 * `CadenceTouchAttempt` mais recente inconsistentes entre si sob concorrência.
 */

const STATUS_TO_DB: Record<CadenceRunStatus, 'Active' | 'Paused' | 'Stopped'> = {
    active: 'Active',
    paused: 'Paused',
    stopped: 'Stopped',
};

const STATUS_FROM_DB: Record<'Active' | 'Paused' | 'Stopped', CadenceRunStatus> = {
    Active: 'active',
    Paused: 'paused',
    Stopped: 'stopped',
};

const STOP_REASON_TO_DB: Record<CadenceStopReason, 'OptOut' | 'LeadReply' | 'Completed' | 'ManualStop'> = {
    'opt-out': 'OptOut',
    'lead-reply': 'LeadReply',
    completed: 'Completed',
    'manual-stop': 'ManualStop',
};

const STOP_REASON_FROM_DB: Record<'OptOut' | 'LeadReply' | 'Completed' | 'ManualStop', CadenceStopReason> = {
    OptOut: 'opt-out',
    LeadReply: 'lead-reply',
    Completed: 'completed',
    ManualStop: 'manual-stop',
};

const CHANNEL_TO_DB: Record<CadenceChannel, 'Email' | 'WhatsApp' | 'Voice'> = {
    email: 'Email',
    whatsapp: 'WhatsApp',
    voice: 'Voice',
};

const CHANNEL_FROM_DB: Record<'Email' | 'WhatsApp' | 'Voice', CadenceChannel> = {
    Email: 'email',
    WhatsApp: 'whatsapp',
    Voice: 'voice',
};

const TOUCH_RESULT_TO_DB: Record<CadenceTouchResult, 'Sent' | 'Failed' | 'Skipped'> = {
    sent: 'Sent',
    failed: 'Failed',
    skipped: 'Skipped',
};

const TOUCH_RESULT_FROM_DB: Record<'Sent' | 'Failed' | 'Skipped', CadenceTouchResult> = {
    Sent: 'sent',
    Failed: 'failed',
    Skipped: 'skipped',
};

type CadenceTouchAttemptRow = {
    touchOrder: number;
    channel: 'Email' | 'WhatsApp' | 'Voice';
    attemptedAt: Date;
    result: 'Sent' | 'Failed' | 'Skipped';
    skipReason: string | null;
    error: string | null;
    providerMessageId: string | null;
};

type CadenceRunRow = {
    id: string;
    organizationId: string;
    leadId: string;
    sequenceId: string;
    status: 'Active' | 'Paused' | 'Stopped';
    currentTouchOrder: number;
    stopReason: 'OptOut' | 'LeadReply' | 'Completed' | 'ManualStop' | null;
    startedAt: Date;
    lastTouchAt: Date | null;
    pausedAt: Date | null;
    stoppedAt: Date | null;
    touchAttempts: CadenceTouchAttemptRow[];
};

function toDomainAttempt(row: CadenceTouchAttemptRow): CadenceTouchAttempt {
    return {
        touchOrder: row.touchOrder,
        channel: CHANNEL_FROM_DB[row.channel],
        attemptedAt: row.attemptedAt,
        result: TOUCH_RESULT_FROM_DB[row.result],
        skipReason: (row.skipReason as CadenceSkipReason | null) ?? undefined,
        error: row.error,
        providerMessageId: row.providerMessageId,
    };
}

function toDomain(row: CadenceRunRow): CadenceRunState {
    return {
        id: row.id,
        organizationId: row.organizationId,
        leadId: row.leadId,
        sequenceId: row.sequenceId,
        status: STATUS_FROM_DB[row.status],
        currentTouchOrder: row.currentTouchOrder,
        stopReason: row.stopReason ? STOP_REASON_FROM_DB[row.stopReason] : null,
        startedAt: row.startedAt,
        lastTouchAt: row.lastTouchAt,
        pausedAt: row.pausedAt,
        stoppedAt: row.stoppedAt,
        attempts: row.touchAttempts.map(toDomainAttempt),
    };
}

/** Ordem estável de leitura das tentativas — cronológica, com o `id` (cuid, criado em sequência) como desempate para `attemptedAt` colidindo no mesmo instante. */
const TOUCH_ATTEMPTS_ORDER = [{ attemptedAt: 'asc' as const }, { id: 'asc' as const }];

export class PrismaCadenceRunRepository implements CadenceRunRepository {
    async save(run: CadenceRunState): Promise<void> {
        await prisma.$transaction(async (tx) => {
            const alreadyPersisted = await tx.cadenceTouchAttempt.count({ where: { cadenceRunId: run.id } });
            const newAttempts = run.attempts.slice(alreadyPersisted);

            await tx.cadenceRun.upsert({
                where: { id: run.id },
                create: {
                    id: run.id,
                    organizationId: run.organizationId,
                    leadId: run.leadId,
                    sequenceId: run.sequenceId,
                    status: STATUS_TO_DB[run.status],
                    currentTouchOrder: run.currentTouchOrder,
                    stopReason: run.stopReason ? STOP_REASON_TO_DB[run.stopReason] : null,
                    startedAt: run.startedAt,
                    lastTouchAt: run.lastTouchAt,
                    pausedAt: run.pausedAt,
                    stoppedAt: run.stoppedAt,
                },
                update: {
                    status: STATUS_TO_DB[run.status],
                    currentTouchOrder: run.currentTouchOrder,
                    stopReason: run.stopReason ? STOP_REASON_TO_DB[run.stopReason] : null,
                    lastTouchAt: run.lastTouchAt,
                    pausedAt: run.pausedAt,
                    stoppedAt: run.stoppedAt,
                },
            });

            if (newAttempts.length > 0) {
                await tx.cadenceTouchAttempt.createMany({
                    data: newAttempts.map((attempt) => ({
                        organizationId: run.organizationId,
                        cadenceRunId: run.id,
                        touchOrder: attempt.touchOrder,
                        channel: CHANNEL_TO_DB[attempt.channel],
                        attemptedAt: attempt.attemptedAt,
                        result: TOUCH_RESULT_TO_DB[attempt.result],
                        skipReason: attempt.skipReason ?? null,
                        error: attempt.error ?? null,
                        providerMessageId: attempt.providerMessageId ?? null,
                    })),
                });
            }
        });
    }

    async findById(organizationId: string, id: string): Promise<CadenceRunState | null> {
        const row = await prisma.cadenceRun.findFirst({
            where: { id, organizationId },
            include: { touchAttempts: { orderBy: TOUCH_ATTEMPTS_ORDER } },
        });
        return row ? toDomain(row) : null;
    }

    async listByOrganization(organizationId: string, filter?: CadenceRunListFilter): Promise<CadenceRunState[]> {
        const rows = await prisma.cadenceRun.findMany({
            where: {
                organizationId,
                ...(filter?.status && filter.status.length > 0
                    ? { status: { in: filter.status.map((s) => STATUS_TO_DB[s]) } }
                    : {}),
            },
            include: { touchAttempts: { orderBy: TOUCH_ATTEMPTS_ORDER } },
            orderBy: { startedAt: 'desc' },
            take: 200,
        });
        return rows.map(toDomain);
    }
}

/** Instância única, sem estado próprio além da conexão Prisma já compartilhada pelo app. */
export const prismaCadenceRunRepository = new PrismaCadenceRunRepository();
