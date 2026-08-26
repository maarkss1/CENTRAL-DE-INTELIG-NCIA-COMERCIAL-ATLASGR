import type { Server } from 'http';
import type { EmbeddedWorkersHandle } from './workers.js';

export interface QuittableConnection {
    quit(): Promise<unknown>;
    disconnect(): unknown;
}

export interface ShutdownLogger {
    info(...args: unknown[]): void;
    error(...args: unknown[]): void;
}

export interface ShutdownDeps {
    httpServer: Server;
    workers: EmbeddedWorkersHandle;
    sseService: { closeAll(): Promise<unknown> };
    prisma: { $disconnect(): Promise<unknown> };
    shutdownLangfuse: () => Promise<unknown>;
    connection: QuittableConnection;
    rateLimiterConnection: QuittableConnection;
    cacheConnection: QuittableConnection;
    logger: ShutdownLogger;
    /** Só para teste: evita chamar process.exit(0) de verdade. Default: process.exit. */
    exit?: (code: number) => void;
}

/**
 * Constrói o handler de graceful shutdown, sem registrá-lo nos sinais do processo — separado de
 * `registerShutdownSignals` para poder ser testado (chamado diretamente) sem depender de
 * `process.on`. A ordem de encerramento é intencional e preservada do server.ts original:
 *
 * 1. para de aceitar novas conexões HTTP (`server.close`);
 * 2. fecha os clientes SSE (`sseService`) — dependem da conexão HTTP já fechada;
 * 3. fecha todos os workers BullMQ embutidos (param de puxar novos jobs);
 * 4. encerra Langfuse (flush de traces pendentes) e desconecta o Prisma;
 * 5. por último, fecha as três conexões Redis (dados, rate limiter, cache) — usadas por quase
 *    tudo acima, por isso ficam por último.
 *
 * Cada etapa é best-effort: um erro ao fechar um recurso é logado, mas não impede o encerramento
 * das etapas seguintes — preferível a travar o shutdown inteiro por causa de um recurso que já
 * estava indisponível (é frequentemente o próprio motivo do shutdown).
 */
export function createGracefulShutdown(deps: ShutdownDeps): (signal: string) => Promise<void> {
    const {
        httpServer,
        workers,
        sseService,
        prisma,
        shutdownLangfuse,
        connection,
        rateLimiterConnection,
        cacheConnection,
        logger,
        exit = (code: number) => process.exit(code),
    } = deps;

    const workerList = () => [
        workers.leadsWorker,
        workers.agentWorker,
        workers.searchWorker,
        workers.enrichmentWorker,
        workers.whatsappSignalWorker,
        workers.bitrixSyncWorker,
        workers.followUpWorker,
        workers.execSummaryWorker,
        workers.deduplicationWorker,
        workers.winLossWorker,
        workers.pdfWorker,
        workers.autoAnonymizeWorker,
        workers.coldCallWorker,
        workers.swarmSchedulerWorker,
        workers.coldLeadsScannerWorker,
        workers.stagnationScannerWorker,
    ];

    return async function shutdown(signal: string): Promise<void> {
        logger.info(`${signal} received: closing gracefully`);

        await new Promise<void>((resolve) => {
            httpServer.close((err) => {
                if (err) {
                    logger.error({ err }, 'Erro ao fechar o servidor HTTP');
                } else {
                    logger.info('Servidor HTTP fechado com sucesso');
                }
                resolve();
            });
        });

        await sseService.closeAll();

        for (const worker of workerList()) {
            await worker?.close();
        }

        await shutdownLangfuse();
        await prisma.$disconnect();

        await Promise.allSettled([
            connection.quit().catch(() => connection.disconnect()),
            rateLimiterConnection.quit().catch(() => rateLimiterConnection.disconnect()),
            cacheConnection.quit().catch(() => cacheConnection.disconnect()),
        ]);

        exit(0);
    };
}

/** Registra o handler de shutdown nos sinais SIGTERM/SIGINT do processo. */
export function registerShutdownSignals(shutdown: (signal: string) => Promise<void>): void {
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
