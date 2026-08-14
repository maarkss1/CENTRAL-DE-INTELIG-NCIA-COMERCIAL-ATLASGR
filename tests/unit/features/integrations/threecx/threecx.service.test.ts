/**
 * `make3CXCall` costumava fabricar sucesso incondicionalmente, sem nenhuma chamada de rede real
 * ao PABX — o vendedor via "ligando" e o CRM registrava "chamada iniciada" mesmo sem nenhum
 * telefone tocar. Estes testes travam o comportamento honesto: sucesso só quando o PABX responde
 * ok, falha real (erro reportado + Activity com o texto correto) quando não responde.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createActivityMock = vi.fn();

// ThreeCXConnection agora é persistida via Prisma (ver handoff
// .agents/handoffs/onda-1/06-para-01-persistencia-3cx.md, resolvido em
// .agents/handoffs/onda-5/01-para-06-persistencia-3cx-implementada.md) em vez do antigo `Map` em
// memória — o mock abaixo simula a tabela com um array local por teste (resetado no beforeEach),
// o suficiente para `seedConnection()` (via connect3CX/create) alimentar o que `make3CXCall`
// (via get3CXConnectionsForOrg/findMany) lê depois.
let threeCXStore: Array<Record<string, unknown>> = [];
const createThreeCXMock = vi.fn((args: { data: Record<string, unknown> }) => {
    const record = { ...args.data };
    threeCXStore.push(record);
    return Promise.resolve(record);
});
const findManyThreeCXMock = vi.fn((args: { where: { organizationId: string } }) => {
    return Promise.resolve(threeCXStore.filter((c) => c.organizationId === args.where.organizationId));
});
const deleteManyThreeCXMock = vi.fn().mockResolvedValue({ count: 0 });

vi.mock('@/lib/prisma', () => ({
    prisma: {
        activity: { create: (...args: unknown[]) => createActivityMock(...args) },
        threeCXConnection: {
            create: (...args: [{ data: Record<string, unknown> }]) => createThreeCXMock(...args),
            findMany: (...args: [{ where: { organizationId: string } }]) => findManyThreeCXMock(...args),
            deleteMany: (...args: unknown[]) => deleteManyThreeCXMock(...args),
        },
    },
}));

// assertSafeWebhookUrl faz DNS lookup real — indisponível/instável em ambiente de teste sandboxed
// (mesmo padrão de src/features/integrations/bitrix/service/__tests__/client.test.ts).
vi.mock('@/lib/adapters/crm/Bitrix24Adapter', () => ({
    assertSafeWebhookUrl: vi.fn().mockResolvedValue(undefined),
}));

import { connect3CX, make3CXCall } from '@/features/integrations/threecx/threecx.service';

const ORG_ID = 'org-3cx-test';

async function seedConnection() {
    return connect3CX(ORG_ID, { pbxUrl: 'https://pbx.example.com', extension: '101' });
}

beforeEach(() => {
    vi.clearAllMocks();
    createActivityMock.mockResolvedValue({});
    threeCXStore = [];
    deleteManyThreeCXMock.mockResolvedValue({ count: 0 });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('make3CXCall — honestidade sobre chamada real (nunca finge sucesso)', () => {
    it('quando o PABX responde ok, reporta sucesso e grava Activity dizendo que a chamada foi disparada', async () => {
        const conn = await seedConnection();
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vi.stubGlobal('fetch', fetchMock);

        const result = await make3CXCall(ORG_ID, conn.id, '11987654321', 'lead-1');

        expect(result.success).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://pbx.example.com/api/v1/calls',
            expect.objectContaining({ method: 'POST' }),
        );
        expect(createActivityMock).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    observations: expect.stringContaining('Chamada disparada via 3CX PABX'),
                }),
            }),
        );
    });

    it('quando o PABX responde erro, NÃO reporta sucesso e a Activity registra a falha, não uma chamada fictícia', async () => {
        const conn = await seedConnection();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

        await expect(make3CXCall(ORG_ID, conn.id, '11987654321', 'lead-2')).rejects.toThrow(
            /Não foi possível disparar a chamada/,
        );

        expect(createActivityMock).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    observations: expect.stringContaining('FALHOU'),
                }),
            }),
        );
        // Nunca escreve a frase de sucesso quando a chamada de verdade falhou.
        const [[{ data }]] = createActivityMock.mock.calls;
        expect(data.observations).not.toContain('Chamada disparada via 3CX PABX');
    });

    it('quando o PABX está inalcançável (falha de rede), NÃO reporta sucesso', async () => {
        const conn = await seedConnection();
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

        await expect(make3CXCall(ORG_ID, conn.id, '11987654321')).rejects.toThrow(
            /Não foi possível disparar a chamada/,
        );
    });

    it('rejeita número de destino inválido antes de qualquer chamada de rede', async () => {
        const conn = await seedConnection();
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(make3CXCall(ORG_ID, conn.id, '123')).rejects.toThrow(/inválido/);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
