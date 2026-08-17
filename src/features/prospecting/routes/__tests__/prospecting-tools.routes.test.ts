/**
 * Cobre a rota /api/prospecting/tools (prospecting-tools.routes.ts) — contrato HTTP das quatro
 * ferramentas standalone de prospecção (Google Places, Apollo, Hunter, status de configuração).
 *
 * Segue o mesmo padrão de src/features/integrations/google/__tests__/google.routes.test.ts: mocka
 * as camadas de serviço (que já têm seus próprios testes/já são reaproveitadas do orquestrador
 * multi-provider) e foca só no contrato do router — validação Zod, shape da resposta e como cada
 * erro de serviço vira resposta HTTP. `authenticateToken`/`requireTenant` não fazem parte deste
 * router (aplicados em server.ts ao montar `/api/prospecting/tools`) — o `req.user` é injetado
 * diretamente, como nos demais testes de rota do projeto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../../../shared/middlewares/errorHandler.js';

const discoverViaGooglePlacesMock = vi.fn();
const fetchKnownExclusionsMock = vi.fn();
const fetchApolloCandidatesMock = vi.fn();
const findPeopleViaDomainSearchMock = vi.fn();
const findEmailViaHunterMock = vi.fn();
const getPaidProspectingKeyMock = vi.fn();
const getProspectingProviderModeMock = vi.fn();

vi.mock('../../services/prospecting.service.js', () => ({
    discoverViaGooglePlaces: (...args: unknown[]) => discoverViaGooglePlacesMock(...args),
    fetchKnownExclusions: (...args: unknown[]) => fetchKnownExclusionsMock(...args),
}));

vi.mock('../../services/apollo.service.js', () => ({
    fetchApolloCandidates: (...args: unknown[]) => fetchApolloCandidatesMock(...args),
}));

vi.mock('../../services/hunter.service.js', () => ({
    findPeopleViaDomainSearch: (...args: unknown[]) => findPeopleViaDomainSearchMock(...args),
    findEmailViaHunter: (...args: unknown[]) => findEmailViaHunterMock(...args),
}));

vi.mock('../../../../config/prospecting-integrations.js', () => ({
    getPaidProspectingKey: (...args: unknown[]) => getPaidProspectingKeyMock(...args),
    getProspectingProviderMode: (...args: unknown[]) => getProspectingProviderModeMock(...args),
}));

import { prospectingToolsRoutes } from '../prospecting-tools.routes.js';

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: { id: string; organizationId: string; role: string } }).user = {
            id: 'test-user',
            organizationId: 'org-1',
            role: 'ADMIN',
        };
        next();
    });
    app.use('/api/prospecting/tools', prospectingToolsRoutes);
    app.use(errorHandler);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
    fetchKnownExclusionsMock.mockResolvedValue({ size: 0 });
});

describe('GET /api/prospecting/tools/status', () => {
    it('devolve o status de configuração das três integrações pagas, sem expor as chaves', async () => {
        getProspectingProviderModeMock.mockReturnValue('hybrid');
        getPaidProspectingKeyMock.mockImplementation((name: string) => (name === 'APOLLO_API_KEY' ? 'secret-key' : undefined));
        const app = buildApp();

        const res = await request(app).get('/api/prospecting/tools/status');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            success: true,
            data: {
                providerMode: 'hybrid',
                googlePlaces: { configured: false },
                apollo: { configured: true },
                hunter: { configured: false },
            },
        });
        expect(JSON.stringify(res.body)).not.toContain('secret-key');
    });
});

describe('POST /api/prospecting/tools/google-places', () => {
    it('rejeita quando segmento está ausente (contrato do schema compartilhado)', async () => {
        const app = buildApp();

        const res = await request(app).post('/api/prospecting/tools/google-places').send({});

        expect(res.status).toBe(400);
        expect(discoverViaGooglePlacesMock).not.toHaveBeenCalled();
    });

    it('busca só via Google Places, aplicando as exclusões do tenant', async () => {
        fetchKnownExclusionsMock.mockResolvedValue({ size: 2 });
        discoverViaGooglePlacesMock.mockResolvedValue([{ tradeName: 'Transportadora ABC' }]);
        const app = buildApp();

        const res = await request(app)
            .post('/api/prospecting/tools/google-places')
            .send({ segmento: 'Transportadora', localizacao: 'São Paulo', quantidade: 5 });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: { candidates: [{ tradeName: 'Transportadora ABC' }] } });
        expect(fetchKnownExclusionsMock).toHaveBeenCalledWith('org-1');
        expect(discoverViaGooglePlacesMock).toHaveBeenCalledWith(
            expect.objectContaining({ segmento: 'Transportadora', quantidade: 5 }),
            5,
            { size: 2 },
        );
    });
});

describe('POST /api/prospecting/tools/apollo', () => {
    it('busca só via Apollo Organization Search e repassa o erro do provedor quando houver', async () => {
        fetchApolloCandidatesMock.mockResolvedValue({ candidates: [], error: 'Apollo API respondeu 403' });
        const app = buildApp();

        const res = await request(app)
            .post('/api/prospecting/tools/apollo')
            .send({ segmento: 'Operador Logístico', quantidade: 10 });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: { candidates: [], error: 'Apollo API respondeu 403' } });
        expect(fetchApolloCandidatesMock).toHaveBeenCalledWith(
            expect.objectContaining({ segmento: 'Operador Logístico' }),
            10,
            expect.anything(),
        );
    });
});

describe('POST /api/prospecting/tools/hunter', () => {
    it('rejeita domínio inválido antes de chamar o Hunter.io', async () => {
        const app = buildApp();

        const res = await request(app).post('/api/prospecting/tools/hunter').send({ domain: 'não é um domínio' });

        expect(res.status).toBe(400);
        expect(findPeopleViaDomainSearchMock).not.toHaveBeenCalled();
    });

    it('normaliza o domínio e devolve os contatos encontrados', async () => {
        findPeopleViaDomainSearchMock.mockResolvedValue({ contacts: [{ name: 'Maria Silva', title: 'CEO', email: 'maria@empresa.com', phone: null, linkedin_url: null }] });
        const app = buildApp();

        const res = await request(app).post('/api/prospecting/tools/hunter').send({ domain: 'https://www.empresa.com.br/', limit: 5 });

        expect(res.status).toBe(200);
        expect(findPeopleViaDomainSearchMock).toHaveBeenCalledWith('empresa.com.br', 5);
        expect(res.body.data.contacts).toHaveLength(1);
    });
});

describe('POST /api/prospecting/tools/hunter/verify-email', () => {
    it('valida domínio e nome completo antes de consultar o Email Finder', async () => {
        findEmailViaHunterMock.mockResolvedValue({ email: 'joao@empresa.com', score: 92 });
        const app = buildApp();

        const res = await request(app)
            .post('/api/prospecting/tools/hunter/verify-email')
            .send({ domain: 'empresa.com.br', fullName: 'João Souza' });

        expect(res.status).toBe(200);
        expect(findEmailViaHunterMock).toHaveBeenCalledWith('empresa.com.br', 'João Souza');
        expect(res.body).toEqual({ success: true, data: { email: 'joao@empresa.com', score: 92 } });
    });
});
