/**
 * Prova de isolamento multi-tenant contra forjamento de organizationId (auditoria de segurança,
 * onda-40): `organizationId` de todo request autenticado vem sempre de `req.user`, populado
 * server-side por `authenticateToken` a partir da sessão (ver
 * src/shared/middlewares/authenticateToken.ts:39-63) — nunca de header, querystring ou body
 * enviado pelo cliente. Isso já é a implementação correta hoje; faltava um teste HTTP explícito
 * simulando um cliente malicioso tentando forjar o tenant.
 *
 * GET /api/intelligence/pending foi escolhida como rota representativa: lista um recurso
 * (AIPendingAction) escopado por tenant via listPendingActions(db, organizationId) — nenhum outro
 * parâmetro entra nessa chamada (ver src/features/intelligence/routes/intelligence.routes.ts,
 * handler de '/pending').
 *
 * Investigação de código feita antes de escrever este teste (não encontrada nenhuma rota que
 * aceite organizationId de header/query/body sem passar por req.user):
 * - Nenhum lugar do código lê um header tipo `X-Organization-Id`/`x-organization-id` para
 *   derivar tenant — grep no repo só encontra o padrão inverso: comentários explícitos
 *   recusando esse vetor (src/lib/security/auditLog.middleware.ts:9-13 e
 *   src/features/lgpd/lgpd.routes.ts:14-17), com a mesma justificativa desta suíte.
 * - Mesmo padrão já confirmado em agent.routes.evaluation-metrics.test.ts ("organizationId vem
 *   sempre de req.user, nunca de querystring"), aqui estendido para header + body + query juntos
 *   numa rota diferente (GET simples, sem query própria) para reduzir a chance de o padrão ser
 *   coincidência de uma única rota.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const listPendingActionsMock = vi.fn();

vi.mock('@/features/intelligence/services/pending-actions.service', () => ({
    listPendingActions: (...args: unknown[]) => listPendingActionsMock(...args),
    approvePendingAction: vi.fn(),
    discardPendingAction: vi.fn(),
}));

vi.mock('@/features/intelligence/services/ai-settings.service', () => ({
    listAiSettings: vi.fn(),
    saveAiSettings: vi.fn(),
}));

import { intelligenceRoutes } from '@/features/intelligence/routes/intelligence.routes';
import { errorHandler } from '@/shared/middlewares/errorHandler';

const REAL_ORG = 'org-real';
const FORGED_ORG = 'org-outra-tentativa-maliciosa';

/**
 * Middleware fake no lugar de authenticateToken real — simula exatamente o que
 * authenticateToken.ts grava em req.user a partir de uma sessão legítima (linhas 51-61), sem
 * depender de auth/DB reais. A app monta a rota de verdade (intelligenceRoutes), não um double.
 */
function buildApp(organizationId: string) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: { id: string; organizationId: string; role: string } }).user = {
            id: 'test-user',
            organizationId,
            role: 'ADMIN',
        };
        next();
    });
    app.use('/api/intelligence', intelligenceRoutes);
    app.use(errorHandler);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
    listPendingActionsMock.mockResolvedValue([]);
});

describe('GET /api/intelligence/pending — organizationId nunca vem do cliente (onda-40)', () => {
    it('usa o organizationId de req.user quando nenhuma forja é tentada', async () => {
        const res = await request(buildApp(REAL_ORG)).get('/api/intelligence/pending');

        expect(res.status).toBe(200);
        expect(listPendingActionsMock).toHaveBeenCalledWith(expect.anything(), REAL_ORG);
    });

    it('ignora organizationId forjado via header X-Organization-Id', async () => {
        const res = await request(buildApp(REAL_ORG))
            .get('/api/intelligence/pending')
            .set('X-Organization-Id', FORGED_ORG);

        expect(res.status).toBe(200);
        expect(listPendingActionsMock).toHaveBeenCalledWith(expect.anything(), REAL_ORG);
        expect(listPendingActionsMock).not.toHaveBeenCalledWith(expect.anything(), FORGED_ORG);
    });

    it('ignora organizationId forjado via querystring', async () => {
        const res = await request(buildApp(REAL_ORG)).get(
            `/api/intelligence/pending?organizationId=${FORGED_ORG}`,
        );

        expect(res.status).toBe(200);
        expect(listPendingActionsMock).toHaveBeenCalledWith(expect.anything(), REAL_ORG);
        expect(listPendingActionsMock).not.toHaveBeenCalledWith(expect.anything(), FORGED_ORG);
    });

    it('ignora organizationId forjado no body, header e querystring simultaneamente', async () => {
        const res = await request(buildApp(REAL_ORG))
            .get(`/api/intelligence/pending?organizationId=${FORGED_ORG}`)
            .set('X-Organization-Id', FORGED_ORG)
            .set('X-Tenant-Id', FORGED_ORG)
            .send({ organizationId: FORGED_ORG });

        expect(res.status).toBe(200);
        expect(listPendingActionsMock).toHaveBeenCalledTimes(1);
        expect(listPendingActionsMock).toHaveBeenCalledWith(expect.anything(), REAL_ORG);
    });

    it('duas organizações distintas continuam isoladas uma da outra (nenhum vazamento cruzado)', async () => {
        const resA = await request(buildApp('org-a')).get('/api/intelligence/pending');
        const resB = await request(buildApp('org-b')).get('/api/intelligence/pending');

        expect(resA.status).toBe(200);
        expect(resB.status).toBe(200);
        expect(listPendingActionsMock).toHaveBeenNthCalledWith(1, expect.anything(), 'org-a');
        expect(listPendingActionsMock).toHaveBeenNthCalledWith(2, expect.anything(), 'org-b');
    });
});
