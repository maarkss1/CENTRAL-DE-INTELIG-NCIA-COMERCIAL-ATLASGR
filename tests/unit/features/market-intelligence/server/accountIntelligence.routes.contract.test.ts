import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authGetSessionMock, getTenantPrismaMock } = vi.hoisted(() => ({
    authGetSessionMock: vi.fn(),
    getTenantPrismaMock: vi.fn((organizationId: string) => ({ organizationId })),
}));

vi.mock('@/lib/auth.js', () => ({
    auth: { api: { getSession: (...args: unknown[]) => authGetSessionMock(...args) } },
}));

vi.mock('@/config/access-policy.js', () => ({ isAuthorizedLoginEmail: () => true }));

vi.mock('@/lib/tenant-prisma.js', () => ({
    getTenantPrisma: (organizationId: string) => getTenantPrismaMock(organizationId),
}));

import { authenticateToken, type AuthRequest } from '@/shared/middlewares/authenticateToken.js';
import { requireTenant } from '@/shared/middlewares/authorization.js';
import { AppError, errorHandler } from '@/shared/middlewares/errorHandler.js';
import { createAccountIntelligenceRouter } from '@/features/market-intelligence/server/accountIntelligence.routes.js';

type Role = 'ADMIN' | 'GESTOR' | 'CLOSER' | 'SDR' | 'VISUALIZADOR';
type CollectionMethod =
    | 'listSignals'
    | 'listDecisionMakers'
    | 'listRelationships'
    | 'listRecommendations'
    | 'listEvidence';

const service = {
    getIntelligence: vi.fn(),
    refresh: vi.fn(),
    listSignals: vi.fn(),
    listDecisionMakers: vi.fn(),
    listRelationships: vi.fn(),
    listRecommendations: vi.fn(),
    listEvidence: vi.fn(),
};

const session = (organizationId: string, role: Role = 'ADMIN') => ({
    user: {
        id: `user-${organizationId}`,
        email: `${organizationId}@atlasgr.test`,
        organizationId,
        role,
    },
});

function buildApp(options: {
    authenticatedAs?: ReturnType<typeof session> | null;
    onServiceRequest?: (req: AuthRequest) => void;
} = {}) {
    const { authenticatedAs = session('org-a'), onServiceRequest } = options;
    authGetSessionMock.mockResolvedValue(authenticatedAs);

    const app = express();
    app.use(express.json());
    app.use(
        '/api/market-intelligence',
        authenticateToken,
        requireTenant,
        createAccountIntelligenceRouter({
            serviceFactory: (req) => {
                onServiceRequest?.(req);
                return service;
            },
        }),
    );
    app.use(errorHandler);
    return app;
}

const partialIntelligence = {
    id: 'snapshot-a-1',
    companyId: 'company-a',
    version: 1,
    status: 'Partial',
    summary: 'Fontes indisponíveis; nenhum fato confirmado nesta atualização.',
    structuredFacts: {},
    sourceStatus: {
        receitaFederal: { status: 'unavailable', reason: 'provider_timeout' },
    },
    generatedAt: '2026-08-18T12:00:00.000Z',
};

const collectionCases: ReadonlyArray<{ path: string; method: CollectionMethod }> = [
    { path: 'signals', method: 'listSignals' },
    { path: 'decision-makers', method: 'listDecisionMakers' },
    { path: 'relationships', method: 'listRelationships' },
    { path: 'recommendations', method: 'listRecommendations' },
    { path: 'evidence', method: 'listEvidence' },
];

function recursivelyCollectedKeys(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(recursivelyCollectedKeys);
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, nested]) => [key, ...recursivelyCollectedKeys(nested)]);
}

beforeEach(() => {
    vi.clearAllMocks();
    getTenantPrismaMock.mockImplementation((organizationId: string) => ({ organizationId }));

    service.getIntelligence.mockResolvedValue(partialIntelligence);
    service.refresh.mockResolvedValue({ snapshot: partialIntelligence, created: true });
    const emptyPage = { items: [], page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false };
    service.listSignals.mockResolvedValue(emptyPage);
    service.listDecisionMakers.mockResolvedValue(emptyPage);
    service.listRelationships.mockResolvedValue(emptyPage);
    service.listRecommendations.mockResolvedValue(emptyPage);
    service.listEvidence.mockResolvedValue(emptyPage);
});

describe('API LDR — autenticação, autorização e origem do tenant', () => {
    it('nega sessão ausente antes de consultar qualquer dado LDR', async () => {
        const response = await request(buildApp({ authenticatedAs: null }))
            .get('/api/market-intelligence/accounts/company-a/intelligence');

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({ success: false });
        expect(service.getIntelligence).not.toHaveBeenCalled();
        expect(getTenantPrismaMock).not.toHaveBeenCalled();
    });

    it('deriva o tenant exclusivamente da sessão e ignora organização forjada em header', async () => {
        let serviceRequest: AuthRequest | undefined;
        const response = await request(buildApp({
            authenticatedAs: session('org-a', 'VISUALIZADOR'),
            onServiceRequest: (req) => {
                serviceRequest = req;
            },
        }))
            .get('/api/market-intelligence/accounts/company-a/intelligence')
            .set('x-organization-id', 'org-b');

        expect(response.status).toBe(200);
        expect(getTenantPrismaMock).toHaveBeenCalledWith('org-a');
        expect(serviceRequest?.user.organizationId).toBe('org-a');
        expect(service.getIntelligence).toHaveBeenCalledWith('company-a');
    });

    it('responde 404 seguro para id de empresa de outro tenant sem revelar sua existência', async () => {
        service.getIntelligence.mockRejectedValueOnce(new AppError('Conta não encontrada.', 404));

        const response = await request(buildApp({ authenticatedAs: session('org-a') }))
            .get('/api/market-intelligence/accounts/company-from-org-b/intelligence')
            .set('x-organization-id', 'org-b');

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ success: false, error: 'Conta não encontrada.' });
        expect(JSON.stringify(response.body)).not.toContain('org-b');
        expect(getTenantPrismaMock).toHaveBeenCalledWith('org-a');
    });

    it('responde o mesmo 404 seguro para empresa inexistente', async () => {
        service.getIntelligence.mockRejectedValueOnce(new AppError('Conta não encontrada.', 404));

        const response = await request(buildApp())
            .get('/api/market-intelligence/accounts/company-missing/intelligence');

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ success: false, error: 'Conta não encontrada.' });
    });

    it('permite leitura a VISUALIZADOR, mas bloqueia refresh para papel abaixo de SDR', async () => {
        const readResponse = await request(buildApp({ authenticatedAs: session('org-a', 'VISUALIZADOR') }))
            .get('/api/market-intelligence/accounts/company-a/intelligence');
        const refreshResponse = await request(buildApp({ authenticatedAs: session('org-a', 'VISUALIZADOR') }))
            .post('/api/market-intelligence/accounts/company-a/refresh');

        expect(readResponse.status).toBe(200);
        expect(refreshResponse.status).toBe(403);
        expect(service.refresh).not.toHaveBeenCalled();
    });

    it.each<Role>(['SDR', 'CLOSER', 'GESTOR', 'ADMIN'])('%s pode solicitar refresh', async (role) => {
        const response = await request(buildApp({ authenticatedAs: session('org-a', role) }))
            .post('/api/market-intelligence/accounts/company-a/refresh');

        expect(response.status).toBe(201);
        expect(service.refresh).toHaveBeenCalledWith('company-a');
    });
});

describe('API LDR — paginação das coleções', () => {
    it.each(collectionCases)('$path devolve uma coleção paginada e converte query para números', async ({ path, method }) => {
        const result = {
            items: [{ id: `${path}-1`, companyId: 'company-a' }],
            page: 2,
            limit: 25,
            total: 26,
            totalPages: 2,
            hasNextPage: false,
        };
        service[method].mockResolvedValueOnce(result);

        const response = await request(buildApp())
            .get(`/api/market-intelligence/accounts/company-a/${path}?page=2&limit=25`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data: result });
        expect(service[method]).toHaveBeenCalledWith('company-a', { page: 2, limit: 25 });
    });

    it.each(collectionCases)('$path rejeita page menor que 1 sem consultar o service', async ({ path, method }) => {
        const response = await request(buildApp())
            .get(`/api/market-intelligence/accounts/company-a/${path}?page=0&limit=20`);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(service[method]).not.toHaveBeenCalled();
    });

    it.each(collectionCases)('$path rejeita limit acima de 100 sem consultar o service', async ({ path, method }) => {
        const response = await request(buildApp())
            .get(`/api/market-intelligence/accounts/company-a/${path}?page=1&limit=101`);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(service[method]).not.toHaveBeenCalled();
    });

    it.each(collectionCases)('$path rejeita paginação não numérica sem consultar o service', async ({ path, method }) => {
        const response = await request(buildApp())
            .get(`/api/market-intelligence/accounts/company-a/${path}?page=abc&limit=vinte`);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(service[method]).not.toHaveBeenCalled();
    });
});

describe('API LDR — refresh idempotente e ausência de dados fabricados', () => {
    it('retorna 201 somente quando um snapshot novo foi criado', async () => {
        service.refresh.mockResolvedValueOnce({ snapshot: partialIntelligence, created: true });

        const response = await request(buildApp({ authenticatedAs: session('org-a', 'SDR') }))
            .post('/api/market-intelligence/accounts/company-a/refresh');

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            success: true,
            data: { snapshot: partialIntelligence, created: true },
        });
    });

    it('retorna 200 e reutiliza o mesmo snapshot quando o refresh é idempotente', async () => {
        const reused = { snapshot: partialIntelligence, created: false };
        service.refresh.mockResolvedValue(reused);

        const first = await request(buildApp({ authenticatedAs: session('org-a', 'SDR') }))
            .post('/api/market-intelligence/accounts/company-a/refresh');
        const second = await request(buildApp({ authenticatedAs: session('org-a', 'SDR') }))
            .post('/api/market-intelligence/accounts/company-a/refresh');

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(first.body.data).toEqual(reused);
        expect(second.body.data).toEqual(reused);
        expect(first.body.data.snapshot.id).toBe(second.body.data.snapshot.id);
    });

    it('preserva estado parcial/vazio quando fontes falham, sem inventar fatos, score ou recomendação', async () => {
        service.getIntelligence.mockResolvedValueOnce(partialIntelligence);

        const response = await request(buildApp())
            .get('/api/market-intelligence/accounts/company-a/intelligence');

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            status: 'Partial',
            structuredFacts: {},
            sourceStatus: { receitaFederal: { status: 'unavailable' } },
        });
        expect(response.body.data).not.toHaveProperty('score');
        expect(response.body.data).not.toHaveProperty('recommendation');
        expect(JSON.stringify(response.body.data)).not.toMatch(/empresa exemplo|score demonstrativo|mock/i);
    });

    it('propaga 422 quando não há fonte suficiente para criar um snapshot real', async () => {
        service.refresh.mockRejectedValueOnce(new AppError('Fontes insuficientes para atualizar a conta.', 422));

        const response = await request(buildApp({ authenticatedAs: session('org-a', 'SDR') }))
            .post('/api/market-intelligence/accounts/company-a/refresh');

        expect(response.status).toBe(422);
        expect(response.body).toEqual({
            success: false,
            error: 'Fontes insuficientes para atualizar a conta.',
        });
    });
});

describe('API LDR — proveniência e sanitização', () => {
    it('mantém FACT, INFERENCE e RECOMMENDATION distinguíveis na coleção de evidências', async () => {
        const evidenceResult = {
            items: [
                { id: 'evidence-fact', factKey: 'cnpj.status', evidenceType: 'FACT', source: 'Receita Federal' },
                { id: 'evidence-inference', factKey: 'buying.intent', evidenceType: 'INFERENCE', source: 'score-engine' },
                { id: 'evidence-recommendation', factKey: 'next.action', evidenceType: 'RECOMMENDATION', source: 'nba-engine' },
            ],
            page: 1,
            limit: 20,
            total: 3,
            totalPages: 1,
            hasNextPage: false,
        };
        service.listEvidence.mockResolvedValueOnce(evidenceResult);

        const response = await request(buildApp())
            .get('/api/market-intelligence/accounts/company-a/evidence');

        expect(response.status).toBe(200);
        expect(response.body.data.items.map((item: { evidenceType: string }) => item.evidenceType))
            .toEqual(['FACT', 'INFERENCE', 'RECOMMENDATION']);
    });

    it.each([
        'intelligence',
        'signals',
        'decision-makers',
        'relationships',
        'recommendations',
        'evidence',
    ])('%s não expõe payload bruto, credencial ou segredo', async (path) => {
        const response = await request(buildApp())
            .get(`/api/market-intelligence/accounts/company-a/${path}`);

        const keys = recursivelyCollectedKeys(response.body).map((key) => key.toLowerCase());
        expect(response.status).toBe(200);
        expect(keys).not.toEqual(expect.arrayContaining([
            'rawdata',
            'rawpayload',
            'apikey',
            'accesstoken',
            'refreshtoken',
            'password',
            'secret',
            'credential',
            'authorization',
        ]));
        expect(JSON.stringify(response.body)).not.toMatch(/bearer\s+[a-z0-9._-]+/i);
    });
});
