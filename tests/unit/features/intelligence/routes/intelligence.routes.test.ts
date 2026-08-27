/**
 * PUT /api/intelligence/ai-settings grava configuração de provider/modelo/temperatura por
 * ferramenta de IA — `AiEngineSetting` não tem `organizationId` (é config global, compartilhada
 * por todos os tenants; ver ai-settings.service.ts). Antes desta correção (auditoria de
 * autorização da Onda 1), a rota não tinha `requireRole` nenhum: qualquer usuário autenticado de
 * qualquer tenant, de qualquer papel (inclusive VISUALIZADOR, que só deveria ter leitura), podia
 * mudar a configuração de IA usada pela plataforma inteira. Este teste tranca que só ADMIN grava.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// AI-007 (parte 3): mesmo gate LGPD já testado em base.agent.consent.test.ts/
// guardrails.service.test.ts, agora também para /toolkit/execute — fail-closed por padrão
// (undefined), cada teste do bloco liga a allowlist explicitamente quando precisa simular
// consentimento. `vi.hoisted` (em vez do truque de nome prefixado "mock") porque este arquivo já
// tem vários blocos `vi.mock` distintos e precisa de ordem de inicialização garantida.
const { mockEnv, summarizeLeadMock } = vi.hoisted(() => ({
    mockEnv: { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: undefined as unknown },
    summarizeLeadMock: vi.fn(),
}));
vi.mock('@/config/env', () => ({ env: mockEnv }));
vi.mock('@/lib/ai/features', () => ({
    summarizeLead: (...args: unknown[]) => summarizeLeadMock(...args),
    generateEmailDraft: vi.fn(), predictConversionScore: vi.fn(), generateMeetingAgenda: vi.fn(),
    draftFollowUp: vi.fn(), scoreLeadQuality: vi.fn(), suggestNextAction: vi.fn(), generateObjectionHandling: vi.fn(),
    analyzeCompetitors: vi.fn(), generateElevatorPitch: vi.fn(), identifyPainPoints: vi.fn(), createColdCallScript: vi.fn(),
    summarizeMeetingNotes: vi.fn(), generateLinkedInMessage: vi.fn(), evaluateDealRisk: vi.fn(), analyzeSentiment: vi.fn(),
    extractKeywords: vi.fn(), categorizeLead: vi.fn(), translateText: vi.fn(), extractActionItems: vi.fn(),
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
    summarizeLeadMock.mockResolvedValue('Resumo gerado.');
});

afterEach(() => {
    mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
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
        expect(approvePendingActionMock).toHaveBeenCalledWith(expect.anything(), 'test-org-id', 'pending-1', 'test-user');
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
        expect(discardPendingActionMock).toHaveBeenCalledWith(expect.anything(), 'test-org-id', 'pending-1', 'test-user');
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

/**
 * AI-007 (parte 3): `/toolkit/execute` despacha texto livre digitado/colado por um operador humano
 * (ex.: anotações de reunião, rascunho de e-mail) para o gateway de IA externo. Igual ao texto livre
 * de missão do BDR/Closer/CRM (ver base.agent.consent.test.ts), pode conter PII de um titular real
 * sem nenhum sinal estrutural — antes desta correção, o endpoint não tinha NENHUMA checagem de base
 * legal LGPD, ao contrário de todo outro caminho que envia dado pessoal a um provedor externo.
 */
describe('POST /api/intelligence/toolkit/execute — trava de consentimento LGPD', () => {
    it('bloqueia com 403 quando a organização não tem base legal registrada, sem chamar a função de IA', async () => {
        const res = await request(buildApp('ADMIN'))
            .post('/api/intelligence/toolkit/execute')
            .send({ functionName: 'summarizeLead', args: ['Anotação com dados do lead.'] });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('test-org-id');
        expect(summarizeLeadMock).not.toHaveBeenCalled();
    });

    it('executa normalmente quando a organização está na allowlist de consentimento', async () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'test-org-id';

        const res = await request(buildApp('ADMIN'))
            .post('/api/intelligence/toolkit/execute')
            .send({ functionName: 'summarizeLead', args: ['Anotação com dados do lead.'] });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(summarizeLeadMock).toHaveBeenCalled();
    });

    it('sem sessão autenticada (sem req.user) também falha fechado e não chama a função de IA', async () => {
        // Em produção, `requireTenant` (montado em src/bootstrap/routes.ts, fora do escopo deste
        // teste de rota isolada) já barra com 401 antes de chegar aqui. Este caso cobre a rota em
        // si: mesmo sem `req.user`, `assertPiiExternalConsent(null)` também nega (organizationId
        // nulo nunca está na allowlist) — nunca um "undefined" solto chega a chamar a IA.
        const app = express();
        app.use(express.json());
        app.use('/api/intelligence', intelligenceRoutes);
        app.use(errorHandler);

        const res = await request(app)
            .post('/api/intelligence/toolkit/execute')
            .send({ functionName: 'summarizeLead', args: ['Anotação com dados do lead.'] });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(summarizeLeadMock).not.toHaveBeenCalled();
    });
});
