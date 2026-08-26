import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../src/lib/prisma.js', () => ({
    prisma: {
        $queryRaw: vi.fn(),
    },
}));

vi.mock('../../../src/lib/queue/redis.js', () => ({
    queuesEnabled: true,
    connection: {
        ping: vi.fn(),
    },
}));

vi.mock('../../../src/lib/logger.js', () => ({
    logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        fatal: vi.fn(),
    },
}));

import { prisma } from '../../../src/lib/prisma.js';
import { connection } from '../../../src/lib/queue/redis.js';
import { mountHealthChecks } from '../../../src/bootstrap/healthchecks.js';

function buildApp() {
    const app = express();
    mountHealthChecks(app);
    return app;
}

describe('bootstrap/healthchecks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('liveness (/health/live e /healthz) responde 200 sem depender de banco/redis', async () => {
        const app = buildApp();

        const live1 = await request(app).get('/health/live');
        const live2 = await request(app).get('/healthz');

        expect(live1.status).toBe(200);
        expect(live1.body.status).toBe('ok');
        expect(live2.status).toBe(200);
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('readiness (/health/ready e /readyz) responde 200 quando banco e Redis estão saudáveis', async () => {
        (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ '?column?': 1 }]);
        (connection.ping as ReturnType<typeof vi.fn>).mockResolvedValue('PONG');

        const app = buildApp();
        const res = await request(app).get('/health/ready');
        const res2 = await request(app).get('/readyz');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res2.status).toBe(200);
        expect(connection.ping).toHaveBeenCalled();
    });

    it('readiness responde 503 quando o banco está indisponível', async () => {
        (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('connection refused'));

        const app = buildApp();
        const res = await request(app).get('/health/ready');

        expect(res.status).toBe(503);
        expect(res.body.status).toBe('error');
    });
});
