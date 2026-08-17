import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '@/shared/middlewares/errorHandler';

// lgpd.routes.ts: organizationId precisa vir exclusivamente de req.user (populado por
// authenticateToken a partir da sessão) — nunca de um header `x-organization-id` controlado pelo
// cliente. Antes desta correção, `req.user?.organizationId || req.headers['x-organization-id']`
// permitia que qualquer requisição forjasse esse header e apagasse/exportasse dados de OUTRO
// tenant. Também cobre o guard de RBAC novo: a exclusão irreversível de titular (Art. 18) agora
// exige ADMIN/GESTOR.

const eraseContact = vi.fn();
const exportContactData = vi.fn();
vi.mock('@/features/lgpd/lgpd.service.js', () => ({
    lgpdService: {
        eraseContact: (...args: unknown[]) => eraseContact(...args),
        exportContactData: (...args: unknown[]) => exportContactData(...args),
    },
}));

const { lgpdRouter } = await import('@/features/lgpd/lgpd.routes.js');

function buildApp(user: { id: string; organizationId: string; role: string } | null) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        if (user) (req as any).user = user;
        next();
    });
    app.use('/api/lgpd', lgpdRouter);
    app.use(errorHandler);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
    eraseContact.mockResolvedValue({ anonymized: true });
    exportContactData.mockResolvedValue({ contact: {} });
});

describe('lgpd.routes — tenant vem só do usuário autenticado', () => {
    it('DELETE /titular/:id: usa req.user.organizationId, ignora um x-organization-id forjado', async () => {
        const app = buildApp({ id: 'u1', organizationId: 'org-real', role: 'ADMIN' });

        await request(app)
            .delete('/api/lgpd/titular/contact-1')
            .set('x-organization-id', 'org-de-outro-tenant');

        expect(eraseContact).toHaveBeenCalledWith('org-real', 'contact-1');
    });

    it('GET /titular/:id/export: usa req.user.organizationId, ignora um x-organization-id forjado', async () => {
        const app = buildApp({ id: 'u1', organizationId: 'org-real', role: 'VISUALIZADOR' });

        await request(app)
            .get('/api/lgpd/titular/contact-1/export')
            .set('x-organization-id', 'org-de-outro-tenant');

        expect(exportContactData).toHaveBeenCalledWith('org-real', 'contact-1');
    });
});

describe('lgpd.routes — RBAC na exclusão irreversível de titular', () => {
    it('bloqueia CLOSER/SDR/VISUALIZADOR com 403 e não chama o service', async () => {
        const app = buildApp({ id: 'u1', organizationId: 'org-real', role: 'VISUALIZADOR' });

        const res = await request(app).delete('/api/lgpd/titular/contact-1');

        expect(res.status).toBe(403);
        expect(eraseContact).not.toHaveBeenCalled();
    });

    it('permite ADMIN', async () => {
        const app = buildApp({ id: 'u1', organizationId: 'org-real', role: 'ADMIN' });

        const res = await request(app).delete('/api/lgpd/titular/contact-1');

        expect(res.status).toBe(200);
        expect(eraseContact).toHaveBeenCalledTimes(1);
    });

    it('permite GESTOR', async () => {
        const app = buildApp({ id: 'u1', organizationId: 'org-real', role: 'GESTOR' });

        const res = await request(app).delete('/api/lgpd/titular/contact-1');

        expect(res.status).toBe(200);
        expect(eraseContact).toHaveBeenCalledTimes(1);
    });

    it('a exportação/leitura continua acessível a papéis menores (sem guard extra)', async () => {
        const app = buildApp({ id: 'u1', organizationId: 'org-real', role: 'VISUALIZADOR' });

        const res = await request(app).get('/api/lgpd/titular/contact-1/export');

        expect(res.status).toBe(200);
        expect(exportContactData).toHaveBeenCalledTimes(1);
    });
});
