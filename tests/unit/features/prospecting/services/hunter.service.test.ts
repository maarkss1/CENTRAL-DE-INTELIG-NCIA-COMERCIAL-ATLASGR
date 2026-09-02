/**
 * `hunter.service.ts` não tinha nenhum teste até este ciclo (Onda 2, Agente 05). Cobre
 * especificamente o achado corrigido em `findEmailViaHunter`: uma resposta HTTP não-ok do Hunter
 * (chave inválida, upstream fora do ar) devolvia `{ email: null }` sem nenhum campo `error` —
 * indistinguível de "Hunter não tem esse e-mail". `findPeopleViaDomainSearch`, a função irmã, já
 * preenchia `.error` nesse caso; este arquivo garante que as duas se comportam da mesma forma.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { findEmailViaHunter, findPeopleViaDomainSearch } from '@/features/prospecting/services/hunter.service.js';
import { resetProviderCacheForTests } from '@/features/prospecting/services/providerCache.js';
import { resetProviderRateLimitersForTests } from '@/features/prospecting/services/providerRateLimit.js';

function jsonResponse(status: number, body: unknown = {}): Response {
    return new Response(JSON.stringify(body), { status });
}

const originalEnv = { ...process.env };

beforeEach(async () => {
    process.env.PROSPECTING_PROVIDER_MODE = 'hybrid';
    process.env.HUNTER_API_KEY = 'test-hunter-key';
    // Vários testes deste arquivo reutilizam o mesmo domínio/nome com respostas HTTP diferentes
    // (sucesso, 401, falha de rede) — sem resetar o cache/rate limit entre eles, uma chamada
    // bem-sucedida "vazaria" como cache hit para o próximo teste que espera exercitar um caminho de
    // erro. `resetProviderCacheForTests` também limpa o Redis real quando configurado (ex.: gate de
    // CI) — sem isso, esse vazamento só reproduzia lá, nunca localmente.
    await resetProviderCacheForTests();
    resetProviderRateLimitersForTests();
});

afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
});

describe('findEmailViaHunter', () => {
    it('sem chave configurada, devolve email:null sem tentar a rede', async () => {
        delete process.env.HUNTER_API_KEY;
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const result = await findEmailViaHunter('empresa.com.br', 'João Silva');

        expect(result).toEqual({ email: null });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('devolve o e-mail encontrado, sem error, no caminho feliz', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: { email: 'joao@empresa.com.br', score: 90 } }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await findEmailViaHunter('empresa.com.br', 'João Silva');

        expect(result).toEqual({ email: 'joao@empresa.com.br', score: 90 });
    });

    it('achado corrigido: resposta não-ok (ex: 401 chave inválida) preenche `.error` em vez de só devolver email:null', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { errors: ['Invalid API key'] }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await findEmailViaHunter('empresa.com.br', 'João Silva');

        expect(result.email).toBeNull();
        expect(result.error).toBeDefined();
        expect(result.error).toContain('401');
    });

    it('achado corrigido: falha de rede/timeout também preenche `.error`', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
        vi.stubGlobal('fetch', fetchMock);

        const result = await findEmailViaHunter('empresa.com.br', 'João Silva');

        expect(result.email).toBeNull();
        expect(result.error).toBe('network down');
    });
});

describe('findPeopleViaDomainSearch — já preenchia `.error` (comportamento de referência)', () => {
    it('preenche `.error` numa resposta não-ok, mesmo padrão agora replicado em findEmailViaHunter', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, {}));
        vi.stubGlobal('fetch', fetchMock);

        const result = await findPeopleViaDomainSearch('empresa.com.br', 5);

        expect(result.contacts).toEqual([]);
        expect(result.error).toBeDefined();
    }, 15_000);
});
