import { describe, it, expect, vi, beforeEach } from 'vitest';

// assertSafeWebhookUrl faz DNS lookup real — indisponível/instável em ambiente de teste sandboxed.
// A proteção SSRF em si (rejeitar IP privado/loopback) é responsabilidade do Agente 01
// (Bitrix24Adapter.ts); aqui testamos que ela É CHAMADA antes de qualquer requisição, não a
// reimplementamos.
const assertSafeWebhookUrlMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/adapters/crm/Bitrix24Adapter', () => ({
    assertSafeWebhookUrl: (...args: unknown[]) => assertSafeWebhookUrlMock(...args),
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({
    prisma: { bitrixConnection: { findFirst: vi.fn() } },
}));

const WEBHOOK = 'https://atlasgr.bitrix24.com.br/rest/1/token/';

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
    return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: init.headers });
}

beforeEach(() => {
    vi.clearAllMocks();
    assertSafeWebhookUrlMock.mockResolvedValue(undefined);
});

describe('callBitrix — resiliência (bloqueador #11: sincronização não pode falhar silenciosamente)', () => {
    it('devolve o resultado direto quando a primeira tentativa já funciona (sem retry)', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ result: [{ ID: '1' }], total: 1 }));
        const { callBitrix } = await import('../client.js');

        const data = await callBitrix<{ result: unknown[] }>(WEBHOOK, 'crm.deal.list', {});

        expect(data.result).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(assertSafeWebhookUrlMock).toHaveBeenCalledWith(WEBHOOK);
        fetchMock.mockRestore();
    });

    it('reintenta em HTTP 5xx e se recupera antes do teto de tentativas', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ error: 'internal' }, { status: 503 }))
            .mockResolvedValueOnce(jsonResponse({ result: [] }));
        const { callBitrix } = await import('../client.js');

        const data = await callBitrix<{ result: unknown[] }>(WEBHOOK, 'crm.lead.list', {}, { maxAttempts: 3 });

        expect(data.result).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        fetchMock.mockRestore();
    });

    it('reintenta em HTTP 429 e some sem erro se o Bitrix libera antes do teto', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({}, { status: 429, headers: { 'Retry-After': '0' } }))
            .mockResolvedValueOnce(jsonResponse({ result: [] }));
        const { callBitrix } = await import('../client.js');

        await callBitrix(WEBHOOK, 'crm.lead.list', {}, { maxAttempts: 3 });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        fetchMock.mockRestore();
    });

    it('reintenta em QUERY_LIMIT_EXCEEDED (rate limit "soft" no corpo, não no HTTP status)', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ error: 'QUERY_LIMIT_EXCEEDED', error_description: 'Too many requests' }))
            .mockResolvedValueOnce(jsonResponse({ result: [] }));
        const { callBitrix } = await import('../client.js');

        await callBitrix(WEBHOOK, 'crm.lead.list', {}, { maxAttempts: 3 });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        fetchMock.mockRestore();
    });

    it('esgota as tentativas em falha persistente de 5xx e lança AppError sanitizado (sem vazar webhook/token)', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'boom' }, { status: 502 }));
        const { callBitrix } = await import('../client.js');
        const { AppError } = await import('@/shared/middlewares/errorHandler');

        await expect(callBitrix(WEBHOOK, 'crm.lead.list', {}, { maxAttempts: 2 })).rejects.toBeInstanceOf(AppError);
        try {
            await callBitrix(WEBHOOK, 'crm.lead.list', {}, { maxAttempts: 2 });
        } catch (err) {
            expect((err as Error).message).not.toContain(WEBHOOK);
            expect((err as Error).message).not.toContain('token');
        }
        expect(fetchMock).toHaveBeenCalledTimes(4); // 2 chamadas de callBitrix acima, 2 tentativas cada
        fetchMock.mockRestore();
    });

    it('NÃO reintenta em HTTP 401 (token revogado) — falha imediata, sem desperdiçar tentativas', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, { status: 401 }));
        const { callBitrix } = await import('../client.js');

        await expect(callBitrix(WEBHOOK, 'crm.lead.list', {}, { maxAttempts: 4 })).rejects.toThrow(/permissão|revogado/i);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        fetchMock.mockRestore();
    });

    it('NÃO reintenta em HTTP 403 — falha imediata', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, { status: 403 }));
        const { callBitrix } = await import('../client.js');

        await expect(callBitrix(WEBHOOK, 'crm.lead.list', {}, { maxAttempts: 4 })).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        fetchMock.mockRestore();
    });

    it('NÃO reintenta em erro definitivo do Bitrix (filtro/campo/permissão inválidos)', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({ error: 'INVALID_ARGUMENT_VALUE', error_description: 'Campo desconhecido' }),
        );
        const { callBitrix } = await import('../client.js');

        await expect(callBitrix(WEBHOOK, 'crm.lead.list', {}, { maxAttempts: 4 })).rejects.toThrow(/Campo desconhecido/);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        fetchMock.mockRestore();
    });

    it('trata falha do tipo AbortError (timeout/cancelamento da requisição) como recuperável e reintenta', async () => {
        const abortError = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockRejectedValueOnce(abortError)
            .mockResolvedValueOnce(jsonResponse({ result: [] }));
        const { callBitrix } = await import('../client.js');

        const data = await callBitrix<{ result: unknown[] }>(WEBHOOK, 'crm.lead.list', {}, { maxAttempts: 3 });

        expect(data.result).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        fetchMock.mockRestore();
    });

    it('trata falha de rede (fetch rejeita) como recuperável e reintenta', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(jsonResponse({ result: [] }));
        const { callBitrix } = await import('../client.js');

        await callBitrix(WEBHOOK, 'crm.lead.list', {}, { maxAttempts: 3 });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        fetchMock.mockRestore();
    });

    it('propaga IDs de correlação estáveis entre tentativas da mesma chamada (rastreabilidade)', async () => {
        const { logger } = await import('@/lib/logger');
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ error: 'x' }, { status: 500 }))
            .mockResolvedValueOnce(jsonResponse({ result: [] }));
        const { callBitrix } = await import('../client.js');

        await callBitrix(WEBHOOK, 'crm.lead.list', {}, { maxAttempts: 3, correlationId: 'fixed-correlation-id' });

        const warnCalls = vi.mocked(logger.warn).mock.calls;
        expect(warnCalls.some(([meta]) => (meta as { correlationId?: string }).correlationId === 'fixed-correlation-id')).toBe(true);
        fetchMock.mockRestore();
    });

    it('rejeita webhook para IP privado/loopback antes de qualquer fetch (SSRF) — via assertSafeWebhookUrl', async () => {
        const { AppError } = await import('@/shared/middlewares/errorHandler');
        assertSafeWebhookUrlMock.mockRejectedValueOnce(new AppError('Endereço de webhook não permitido (IP privado/reservado).', 400));
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        const { callBitrix } = await import('../client.js');

        await expect(callBitrix('https://127.0.0.1/rest/1/token/', 'crm.lead.list', {})).rejects.toThrow(/não permitido/);
        expect(fetchMock).not.toHaveBeenCalled();
        fetchMock.mockRestore();
    });
});
