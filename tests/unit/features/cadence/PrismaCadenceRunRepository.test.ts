import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `save()` roda numa transação interativa (`prisma.$transaction(async (tx) => ...)`) — o mock de
 * `$transaction` (implementação real setada no `beforeEach`, fora da factory de `vi.mock` — ela
 * não pode referenciar nenhuma variável externa, é hoisted acima dos imports) só executa o
 * callback passando o mesmo objeto `prisma` mockado como `tx` (suficiente pra este teste: o que
 * importa é que `count`/`upsert`/`createMany` foram chamados com os argumentos certos, não o
 * isolamento real de transação, que só o Postgres real garante).
 */
vi.mock('@/lib/prisma', () => ({
    prisma: {
        cadenceRun: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            upsert: vi.fn(),
        },
        cadenceTouchAttempt: {
            count: vi.fn(),
            createMany: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

import { prisma } from '@/lib/prisma';
import { PrismaCadenceRunRepository } from '@/features/cadence/infra/PrismaCadenceRunRepository';
import type { CadenceRunState } from '@/features/cadence/domain/cadence';

type Mocked<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };
const mockedPrisma = prisma as unknown as {
    cadenceRun: Mocked<{ findFirst: unknown; findMany: unknown; upsert: unknown }>;
    cadenceTouchAttempt: Mocked<{ count: unknown; createMany: unknown }>;
    $transaction: ReturnType<typeof vi.fn>;
};

const repo = new PrismaCadenceRunRepository();
const ORG = 'org-1';

beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockedPrisma));
});

const DB_ROW = {
    id: 'run-1',
    organizationId: ORG,
    leadId: 'lead-1',
    sequenceId: 'seq-1',
    status: 'Active' as const,
    currentTouchOrder: 2,
    stopReason: null,
    startedAt: new Date('2026-08-01T10:00:00Z'),
    lastTouchAt: new Date('2026-08-01T10:05:00Z'),
    pausedAt: null,
    stoppedAt: null,
    touchAttempts: [
        {
            touchOrder: 1,
            channel: 'Email' as const,
            attemptedAt: new Date('2026-08-01T10:05:00Z'),
            result: 'Sent' as const,
            skipReason: null,
            error: null,
        },
    ],
};

describe('PrismaCadenceRunRepository.findById', () => {
    it('mapeia o enum Postgres (PascalCase) pro domínio (lowercase/kebab), incluindo as tentativas', async () => {
        mockedPrisma.cadenceRun.findFirst.mockResolvedValue(DB_ROW);

        const run = await repo.findById(ORG, 'run-1');

        expect(run).toEqual<CadenceRunState>({
            id: 'run-1',
            organizationId: ORG,
            leadId: 'lead-1',
            sequenceId: 'seq-1',
            status: 'active',
            currentTouchOrder: 2,
            stopReason: null,
            startedAt: DB_ROW.startedAt,
            lastTouchAt: DB_ROW.lastTouchAt,
            pausedAt: null,
            stoppedAt: null,
            attempts: [
                {
                    touchOrder: 1,
                    channel: 'email',
                    attemptedAt: DB_ROW.touchAttempts[0].attemptedAt,
                    result: 'sent',
                    skipReason: undefined,
                    error: null,
                },
            ],
        });
        expect(mockedPrisma.cadenceRun.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'run-1', organizationId: ORG } }),
        );
    });

    it('devolve null quando o run não existe (ou é de outra organização — findFirst já filtra por organizationId)', async () => {
        mockedPrisma.cadenceRun.findFirst.mockResolvedValue(null);

        const run = await repo.findById(ORG, 'run-inexistente');

        expect(run).toBeNull();
    });

    it('mapeia stopReason e skipReason quando presentes', async () => {
        mockedPrisma.cadenceRun.findFirst.mockResolvedValue({
            ...DB_ROW,
            status: 'Stopped',
            stopReason: 'OptOut',
            touchAttempts: [
                { touchOrder: 1, channel: 'WhatsApp', attemptedAt: new Date(), result: 'Skipped', skipReason: 'opt-out', error: null },
            ],
        });

        const run = await repo.findById(ORG, 'run-1');

        expect(run?.status).toBe('stopped');
        expect(run?.stopReason).toBe('opt-out');
        expect(run?.attempts[0]).toMatchObject({ channel: 'whatsapp', result: 'skipped', skipReason: 'opt-out' });
    });
});

describe('PrismaCadenceRunRepository.listByOrganization', () => {
    it('sem filtro, lista por organizationId sem cláusula de status', async () => {
        mockedPrisma.cadenceRun.findMany.mockResolvedValue([DB_ROW]);

        const runs = await repo.listByOrganization(ORG);

        expect(runs).toHaveLength(1);
        expect(runs[0].status).toBe('active');
        const where = mockedPrisma.cadenceRun.findMany.mock.calls[0][0].where;
        expect(where).toEqual({ organizationId: ORG });
    });

    it('com filtro de status, mapeia CadenceRunStatus do domínio pro enum Postgres em `status.in`', async () => {
        mockedPrisma.cadenceRun.findMany.mockResolvedValue([]);

        await repo.listByOrganization(ORG, { status: ['active', 'paused'] });

        const where = mockedPrisma.cadenceRun.findMany.mock.calls[0][0].where;
        expect(where).toEqual({ organizationId: ORG, status: { in: ['Active', 'Paused'] } });
    });

    it('nunca lista runs de outra organização — where sempre trava organizationId', async () => {
        mockedPrisma.cadenceRun.findMany.mockResolvedValue([]);

        await repo.listByOrganization('org-2');

        expect(mockedPrisma.cadenceRun.findMany.mock.calls[0][0].where.organizationId).toBe('org-2');
    });
});

describe('PrismaCadenceRunRepository.save', () => {
    const RUN: CadenceRunState = {
        id: 'run-1',
        organizationId: ORG,
        leadId: 'lead-1',
        sequenceId: 'seq-1',
        status: 'active',
        currentTouchOrder: 2,
        stopReason: null,
        startedAt: new Date('2026-08-01T10:00:00Z'),
        lastTouchAt: new Date('2026-08-01T10:05:00Z'),
        pausedAt: null,
        stoppedAt: null,
        attempts: [
            { touchOrder: 1, channel: 'email', attemptedAt: new Date('2026-08-01T10:05:00Z'), result: 'sent', error: null },
        ],
    };

    it('faz upsert do CadenceRun com os enums mapeados pra PascalCase', async () => {
        mockedPrisma.cadenceTouchAttempt.count.mockResolvedValue(0);
        mockedPrisma.cadenceRun.upsert.mockResolvedValue({});
        mockedPrisma.cadenceTouchAttempt.createMany.mockResolvedValue({ count: 1 });

        await repo.save(RUN);

        expect(mockedPrisma.cadenceRun.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'run-1' },
                create: expect.objectContaining({ status: 'Active', currentTouchOrder: 2, stopReason: null }),
                update: expect.objectContaining({ status: 'Active', currentTouchOrder: 2, stopReason: null }),
            }),
        );
    });

    it('só insere as tentativas NOVAS (além das já persistidas) — nunca duplica um `save()` repetido com o mesmo histórico', async () => {
        mockedPrisma.cadenceTouchAttempt.count.mockResolvedValue(1); // a única tentativa do RUN já está no banco
        mockedPrisma.cadenceRun.upsert.mockResolvedValue({});

        await repo.save(RUN);

        expect(mockedPrisma.cadenceTouchAttempt.createMany).not.toHaveBeenCalled();
    });

    it('insere só a cauda nova quando o run ganhou tentativas desde o último save', async () => {
        const runWithTwoAttempts: CadenceRunState = {
            ...RUN,
            attempts: [
                ...RUN.attempts,
                { touchOrder: 1, channel: 'email', attemptedAt: new Date('2026-08-01T11:00:00Z'), result: 'failed', error: 'timeout' },
            ],
        };
        mockedPrisma.cadenceTouchAttempt.count.mockResolvedValue(1); // só a primeira já estava persistida
        mockedPrisma.cadenceRun.upsert.mockResolvedValue({});
        mockedPrisma.cadenceTouchAttempt.createMany.mockResolvedValue({ count: 1 });

        await repo.save(runWithTwoAttempts);

        expect(mockedPrisma.cadenceTouchAttempt.createMany).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({ touchOrder: 1, channel: 'Email', result: 'Failed', error: 'timeout' }),
            ],
        });
    });

    it('nunca marca um toque como Sent sem o chamador ter confirmado — mapeamento é 1:1 com o resultado recebido, não otimista', async () => {
        mockedPrisma.cadenceTouchAttempt.count.mockResolvedValue(0);
        mockedPrisma.cadenceRun.upsert.mockResolvedValue({});
        mockedPrisma.cadenceTouchAttempt.createMany.mockResolvedValue({ count: 1 });

        const failedRun: CadenceRunState = {
            ...RUN,
            attempts: [{ touchOrder: 1, channel: 'voice', attemptedAt: new Date(), result: 'failed', error: 'provedor recusou' }],
        };
        await repo.save(failedRun);

        expect(mockedPrisma.cadenceTouchAttempt.createMany).toHaveBeenCalledWith({
            data: [expect.objectContaining({ result: 'Failed', error: 'provedor recusou' })],
        });
    });
});
