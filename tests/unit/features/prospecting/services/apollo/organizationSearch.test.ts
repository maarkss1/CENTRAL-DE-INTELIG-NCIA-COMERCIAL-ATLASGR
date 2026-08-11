/**
 * `fetchApolloCandidates` é o ponto de entrada real de descoberta via Apollo.io. Estes testes
 * cobrem os cenários exigidos pela missão do Agente 05 (Onda 2) para o provider: sucesso,
 * 429 (retentado e recuperado via fetchWithProviderRetry), 4xx definitivo (não retentado, erro
 * exposto ao chamador em vez de escondido) e resposta parcial (organização sem campos opcionais
 * não quebra o mapeamento).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { fetchApolloCandidates } from '../../../../../../src/features/prospecting/services/apollo/organizationSearch.js';
import type { ProspectCriteria } from '../../../../../../src/features/prospecting/services/prospecting.service.js';

function jsonResponse(status: number, body: unknown = {}): Response {
    return new Response(JSON.stringify(body), { status });
}

const criteria: ProspectCriteria = {
    segmento: 'Transportadora',
    localizacao: 'Rio de Janeiro e Região',
    quantidade: 5,
};

const originalEnv = { ...process.env };

beforeEach(() => {
    process.env.PROSPECTING_PROVIDER_MODE = 'hybrid';
    process.env.APOLLO_API_KEY = 'test-apollo-key';
});

afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
});

describe('fetchApolloCandidates — sem API key configurada', () => {
    it('devolve lista vazia sem tentar chamar a rede quando não há chave paga', async () => {
        delete process.env.APOLLO_API_KEY;
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const result = await fetchApolloCandidates(criteria, 5);

        expect(result.candidates).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('fetchApolloCandidates — provider success', () => {
    it('mapeia organizações reais para candidatos', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse(200, {
                organizations: [
                    {
                        name: 'Transportadora Exemplo LTDA',
                        industry: 'trucking',
                        estimated_num_employees: 80,
                        city: 'Niterói',
                        state: 'RJ',
                        primary_domain: null,
                    },
                ],
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await fetchApolloCandidates(criteria, 5);

        expect(result.error).toBeUndefined();
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].tradeName).toBe('Transportadora Exemplo LTDA');
        expect(result.candidates[0].size).toBe('~80 funcionários');
    });
});

describe('fetchApolloCandidates — resposta parcial', () => {
    it('não quebra quando a organização não traz campos opcionais (nome, domínio, funcionários)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse(200, {
                organizations: [{}], // organização real da Apollo pode vir quase vazia
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await fetchApolloCandidates(criteria, 5);

        expect(result.error).toBeUndefined();
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].tradeName).toBe('Empresa sem nome (Apollo)');
        expect(result.candidates[0].size).toBe('Não informado');
        expect(result.candidates[0].website).toBeNull();
    });
});

describe('fetchApolloCandidates — 429 transitório', () => {
    it('retenta automaticamente e devolve os candidatos quando a próxima tentativa funciona', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(429, { error: 'rate_limited' }))
            .mockResolvedValueOnce(jsonResponse(200, { organizations: [{ name: 'Empresa Retentada' }] }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await fetchApolloCandidates(criteria, 5);

        expect(result.error).toBeUndefined();
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].tradeName).toBe('Empresa Retentada');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    }, 15_000);
});

describe('fetchApolloCandidates — 5xx transitório', () => {
    it('retenta em erro de servidor da Apollo e se recupera', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(503, {}))
            .mockResolvedValueOnce(jsonResponse(200, { organizations: [] }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await fetchApolloCandidates(criteria, 5);

        expect(result.error).toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    }, 15_000);
});

describe('fetchApolloCandidates — 4xx definitivo (não retenta)', () => {
    it('expõe o erro real (API key inválida) em vez de esconder a falha ou fabricar candidatos', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'Invalid API key' }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await fetchApolloCandidates(criteria, 5);

        expect(result.candidates).toEqual([]);
        expect(result.error).toContain('401');
        expect(fetchMock).toHaveBeenCalledTimes(1); // 401 é definitivo — nunca retenta
    });
});
