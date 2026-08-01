import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const queryRawMock = vi.fn();

vi.mock('../../../lib/prisma.js', () => ({
    prisma: { $queryRaw: (...args: unknown[]) => queryRawMock(...args) },
}));

const warnMock = vi.fn();
const errorMock = vi.fn();
vi.mock('../../../lib/logger.js', () => ({
    logger: { warn: (...a: unknown[]) => warnMock(...a), error: (...a: unknown[]) => errorMock(...a) },
}));

import { hasVectorSupport, resetVectorSupportCache } from '../vector-support';

beforeEach(() => {
    vi.clearAllMocks();
    resetVectorSupportCache();
});

afterEach(() => resetVectorSupportCache());

describe('hasVectorSupport', () => {
    it('reconhece o banco com a extensão ativa', async () => {
        queryRawMock.mockResolvedValue([{ present: true }]);
        expect(await hasVectorSupport()).toBe(true);
        expect(warnMock).not.toHaveBeenCalled();
    });

    it('avisa uma vez quando a extensão está ausente', async () => {
        queryRawMock.mockResolvedValue([{ present: false }]);
        expect(await hasVectorSupport()).toBe(false);
        expect(warnMock).toHaveBeenCalledTimes(1);
    });

    it('degrada para false quando a consulta ao catálogo falha', async () => {
        queryRawMock.mockRejectedValue(new Error('banco fora do ar'));
        expect(await hasVectorSupport()).toBe(false);
        expect(errorMock).toHaveBeenCalled();
    });

    it('memoriza o resultado: é propriedade do servidor, não da requisição', async () => {
        queryRawMock.mockResolvedValue([{ present: true }]);
        await Promise.all([hasVectorSupport(), hasVectorSupport(), hasVectorSupport()]);
        expect(queryRawMock).toHaveBeenCalledTimes(1);
    });

    it('reavalia depois de limpar o cache', async () => {
        queryRawMock.mockResolvedValue([{ present: true }]);
        await hasVectorSupport();
        resetVectorSupportCache();
        queryRawMock.mockResolvedValue([{ present: false }]);
        expect(await hasVectorSupport()).toBe(false);
        expect(queryRawMock).toHaveBeenCalledTimes(2);
    });
});
