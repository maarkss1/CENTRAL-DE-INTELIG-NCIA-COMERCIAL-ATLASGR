import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// auditAccessMiddleware registrava tenantId a partir de `req.user?.organizationId || x-organization-id`
// — um header controlado pelo cliente. Isso fazia o próprio log de auditoria mentir sobre de qual
// tenant é o acesso (e mascarava um acesso indevido como se fosse de um tenant forjado). O tenantId
// do log agora vem exclusivamente de req.user.

const auditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/audit/audit.service.js', () => ({
    AuditService: { log: (...args: unknown[]) => auditLog(...args) },
}));

const { auditAccessMiddleware } = await import('@/lib/security/auditLog.middleware.js');

function buildApp(user: { id: string; organizationId: string } | null) {
    const app = express();
    app.use((req, _res, next) => {
        if (user) (req as any).user = user;
        next();
    });
    app.use(auditAccessMiddleware('Contact'));
    app.get('/resource', (_req, res) => res.status(200).json({ ok: true }));
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
});

// res.on('finish') dispara de forma assíncrona depois da resposta ser enviada — dá um tick para
// o listener rodar antes de checar o mock.
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('auditAccessMiddleware — tenantId vem só do usuário autenticado', () => {
    it('usa req.user.organizationId, ignora um x-organization-id forjado no header', async () => {
        const app = buildApp({ id: 'u1', organizationId: 'org-real' });

        await request(app).get('/resource').set('x-organization-id', 'org-de-outro-tenant');
        await flush();

        expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'org-real' }));
    });

    it('sem usuário autenticado: tenantId fica undefined, nunca cai para o header', async () => {
        const app = buildApp(null);

        await request(app).get('/resource').set('x-organization-id', 'org-de-outro-tenant');
        await flush();

        expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ tenantId: undefined }));
    });
});
