/**
 * PUT /api/intelligence/ai-settings grava configuração de provider/modelo/temperatura por
 * ferramenta de IA — `AiEngineSetting` não tem `organizationId` (é config global, compartilhada
 * por todos os tenants; ver ai-settings.service.ts). Antes desta correção (auditoria de
 * autorização da Onda 1), a rota não tinha `requireRole` nenhum: qualquer usuário autenticado de
 * qualquer tenant, de qualquer papel (inclusive VISUALIZADOR, que só deveria ter leitura), podia
 * mudar a configuração de IA usada pela plataforma inteira. Este teste tranca que só ADMIN grava.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const listAiSettingsMock = vi.fn();
const saveAiSettingsMock = vi.fn();

vi.mock('@/features/intelligence/services/ai-settings.service', () => ({
    listAiSettings: (...args: unknown[]) => listAiSettingsMock(...args),
    saveAiSettings: (...args: unknown[]) => saveAiSettingsMock(...args),
}));

const listPendingActionsMock = vi.fn();
const approvePendingActionMock = vi.fn();
const discardPendingActionMock = vi.fn();

vi.mock('@/features/intelligence/services/pending-actions.service', () => ({
    listPendingActions: (...args: unknown[]) => listPendingActionsMock(...args),
    approvePendingAction: (...args: unknown[]) => approvePendingActionMock(...args),
    discardPendingAction: (...args: unknown[]) => discardPendingActionMock(...args),
}));

import { intelligenceRoutes } from '@/features/intelligence/routes/intelligence.routes';
import { errorHandler } from '@/shared/middlewares/errorHandler';

function buildApp(role: string) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: { id: string; organizationId: string; role: string } }).user = {
            id: 'test-user',
            organizationId: 'test-org-id',
            role,
        };
        next();
    });
    app.use('/api/intelligence', intelligenceRoutes);
    app.use(errorHandler);
    return app;
}

const validPayload = {
    settings: [{ toolKey: 'copilot', provider: 'local', model: 'local-llama3', temperature: 0.5 }],
};

beforeEach(() => {
    vi.clearAllMocks();
    listAiSettingsMock.mockResolvedValue([]);
    saveAiSettingsMock.mockResolvedValue([{ toolKey: 'copilot' }]);
    approvePendingActionMock.mockResolvedValue({
        action: { id: 'pending-1' },
        execution: { sent: true },
    });
    discardPendingActionMock.mockResolvedValue(true);
});

/**
 * SEC-011: aprovar/descartar uma AIPendingAction dispara efeito real (enviar e-mail, criar
 * nota/atividade — ver executeAction em aiPendingAction.service.ts). Antes desta correção, as duas
 * rotas não tinham `requireRole` — qualquer papel autenticado do tenant, inclusive VISUALIZADOR
 * (só leitura), podia confirmar uma ação de alto impacto. Este teste tranca que só
 * ADMIN/GESTOR/CLOSER/SDR podem aprovar/descartar.
 */
describe('POST /api/intelligence/pending/:id/approve — autorização (ação de alto impacto)', () => {
    it.each(['ADMIN', 'GESTOR', 'CLOSER', 'SDR'])('%s aprova com sucesso (papel permitido)', async (role) => {
        const res = await request(buildApp(role)).post('/api/intelligence/pending/pending-1/approve');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(approvePendingActionMock).toHaveBeenCalledWith(expect.anything(), 'test-org-id', 'pending-1');
    });

    it('VISUALIZADOR recebe 403 e não aprova (papel negado)', async () => {
        const res = await request(buildApp('VISUALIZADOR')).post('/api/intelligence/pending/pending-1/approve');

        expect(res.status).toBe(403);
        expect(approvePendingActionMock).not.toHaveBeenCalled();
    });

    it('sem sessão autenticada recebe 401 e não aprova', async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/intelligence', intelligenceRoutes);
        app.use(errorHandler);

        const res = await request(app).post('/api/intelligence/pending/pending-1/approve');

        expect(res.status).toBe(401);
        expect(approvePendingActionMock).not.toHaveBeenCalled();
    });
});

describe('DELETE /api/intelligence/pending/:id — autorização (descarte de ação de alto impacto)', () => {
    it.each(['ADMIN', 'GESTOR', 'CLOSER', 'SDR'])('%s descarta com sucesso (papel permitido)', async (role) => {
        const res = await request(buildApp(role)).delete('/api/intelligence/pending/pending-1');

        expect(res.status).toBe(204);
        expect(discardPendingActionMock).toHaveBeenCalledWith(expect.anything(), 'test-org-id', 'pending-1');
    });

    it('VISUALIZADOR recebe 403 e não descarta (papel negado)', async () => {
        const res = await request(buildApp('VISUALIZADOR')).delete('/api/intelligence/pending/pending-1');

        expect(res.status).toBe(403);
        expect(discardPendingActionMock).not.toHaveBeenCalled();
    });
});

describe('PUT /api/intelligence/ai-settings — autorização (config global, sem tenant)', () => {
    it('ADMIN grava com sucesso (papel permitido)', async () => {
        const res = await request(buildApp('ADMIN')).put('/api/intelligence/ai-settings').send(validPayload);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(saveAiSettingsMock).toHaveBeenCalledWith(validPayload.settings);
    });

    it.each(['GESTOR', 'CLOSER', 'SDR', 'VISUALIZADOR'])('%s recebe 403 e não grava (papel negado)', async (role) => {
        const res = await request(buildApp(role)).put('/api/intelligence/ai-settings').send(validPayload);

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(saveAiSettingsMock).not.toHaveBeenCalled();
    });

    it('sem sessão autenticada recebe 401 e não grava', async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/intelligence', intelligenceRoutes);
        app.use(errorHandler);

        const res = await request(app).put('/api/intelligence/ai-settings').send(validPayload);

        expect(res.status).toBe(401);
        expect(saveAiSettingsMock).not.toHaveBeenCalled();
    });

    it('GET /api/intelligence/ai-settings continua acessível a qualquer papel autenticado (somente leitura)', async () => {
        const res = await request(buildApp('VISUALIZADOR')).get('/api/intelligence/ai-settings');

        expect(res.status).toBe(200);
        expect(listAiSettingsMock).toHaveBeenCalled();
    });
});
