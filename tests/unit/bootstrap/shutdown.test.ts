import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Server } from 'http';
import { createGracefulShutdown, type ShutdownDeps } from '../../../src/bootstrap/shutdown.js';
import type { EmbeddedWorkersHandle } from '../../../src/bootstrap/workers.js';

function fakeWorker(name: string, calls: string[]) {
    return { close: vi.fn(async () => { calls.push(`worker:${name}`); }) } as unknown as NonNullable<EmbeddedWorkersHandle['leadsWorker']>;
}

function buildDeps(calls: string[], overrides: Partial<ShutdownDeps> = {}): ShutdownDeps {
    const workers: EmbeddedWorkersHandle = {
        leadsWorker: fakeWorker('leads', calls),
        agentWorker: fakeWorker('agent', calls),
        enrichmentWorker: null,
        whatsappSignalWorker: null,
        bitrixSyncWorker: null,
        followUpWorker: null,
        execSummaryWorker: null,
        deduplicationWorker: null,
        winLossWorker: null,
        pdfWorker: null,
        autoAnonymizeWorker: null,
        coldLeadsScannerWorker: null,
        stagnationScannerWorker: null,
        searchWorker: null,
        coldCallWorker: fakeWorker('coldCall', calls),
        swarmSchedulerWorker: null,
    };

    const httpServer = {
        close: vi.fn((cb?: (err?: Error) => void) => {
            calls.push('httpServer.close');
            cb?.(undefined);
        }),
    } as unknown as Server;

    return {
        httpServer,
        workers,
        sseService: { closeAll: vi.fn(async () => { calls.push('sseService.closeAll'); }) },
        prisma: { $disconnect: vi.fn(async () => { calls.push('prisma.$disconnect'); }) },
        shutdownLangfuse: vi.fn(async () => { calls.push('shutdownLangfuse'); }),
        connection: {
            quit: vi.fn(async () => { calls.push('connection.quit'); }),
            disconnect: vi.fn(() => { calls.push('connection.disconnect'); }),
        },
        rateLimiterConnection: {
            quit: vi.fn(async () => { calls.push('rateLimiterConnection.quit'); }),
            disconnect: vi.fn(() => { calls.push('rateLimiterConnection.disconnect'); }),
        },
        cacheConnection: {
            quit: vi.fn(async () => { calls.push('cacheConnection.quit'); }),
            disconnect: vi.fn(() => { calls.push('cacheConnection.disconnect'); }),
        },
        logger: { info: vi.fn(), error: vi.fn() },
        exit: vi.fn((code: number) => { calls.push(`exit(${code})`); }),
        ...overrides,
    };
}

describe('bootstrap/shutdown', () => {
    let calls: string[];

    beforeEach(() => {
        calls = [];
    });

    it('fecha os recursos na ordem esperada: HTTP -> SSE -> workers -> Langfuse/Prisma -> Redis -> exit(0)', async () => {
        const deps = buildDeps(calls);
        const shutdown = createGracefulShutdown(deps);

        await shutdown('SIGTERM');

        const httpIndex = calls.indexOf('httpServer.close');
        const sseIndex = calls.indexOf('sseService.closeAll');
        const leadsWorkerIndex = calls.indexOf('worker:leads');
        const langfuseIndex = calls.indexOf('shutdownLangfuse');
        const prismaIndex = calls.indexOf('prisma.$disconnect');
        const redisIndex = calls.indexOf('connection.quit');
        const exitIndex = calls.indexOf('exit(0)');

        expect(httpIndex).toBe(0);
        expect(sseIndex).toBeGreaterThan(httpIndex);
        expect(leadsWorkerIndex).toBeGreaterThan(sseIndex);
        expect(langfuseIndex).toBeGreaterThan(leadsWorkerIndex);
        expect(prismaIndex).toBeGreaterThan(langfuseIndex);
        expect(redisIndex).toBeGreaterThan(prismaIndex);
        expect(exitIndex).toBe(calls.length - 1);

        // Workers nulos no handle nunca são fechados (nada a fechar).
        expect(deps.workers.enrichmentWorker).toBeNull();
    });

    it('só fecha workers que existem (não nulos) no handle', async () => {
        const deps = buildDeps(calls);
        const shutdown = createGracefulShutdown(deps);

        await shutdown('SIGINT');

        expect(deps.workers.leadsWorker?.close).toHaveBeenCalledTimes(1);
        expect(deps.workers.agentWorker?.close).toHaveBeenCalledTimes(1);
        expect(deps.workers.coldCallWorker?.close).toHaveBeenCalledTimes(1);
    });

    it('continua o shutdown mesmo se o fechamento do servidor HTTP reportar erro', async () => {
        const deps = buildDeps(calls);
        (deps.httpServer.close as unknown as ReturnType<typeof vi.fn>) = vi.fn((cb?: (err?: Error) => void) => {
            calls.push('httpServer.close');
            cb?.(new Error('boom'));
        });

        const shutdown = createGracefulShutdown(deps);
        await shutdown('SIGTERM');

        expect(deps.logger.error).toHaveBeenCalled();
        expect(calls).toContain('sseService.closeAll');
        expect(calls).toContain('exit(0)');
    });

    it('cai para disconnect() quando quit() de uma conexão Redis rejeita', async () => {
        const calls2: string[] = [];
        const deps = buildDeps(calls2, {
            connection: {
                quit: vi.fn(async () => { throw new Error('redis quit failed'); }),
                disconnect: vi.fn(() => { calls2.push('connection.disconnect'); }),
            },
        });

        const shutdown = createGracefulShutdown(deps);
        await shutdown('SIGTERM');

        expect(deps.connection.disconnect).toHaveBeenCalled();
        expect(calls2).toContain('exit(0)');
    });
});
