/**
 * Lista interna de bloqueio de discagem (opt-out).
 *
 * O que estes testes protegem é a normalização: o bloqueio só vale se o mesmo telefone cadastrado
 * em formatos diferentes cair na mesma chave. Um opt-out que escapa por causa de um parêntese é
 * indistinguível, na prática, de não ter opt-out nenhum.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        callSuppression: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
    isSuppressed,
    recordOptOut,
    normalizeSuppressionKey,
} from '@/features/integrations/birth-voice/callSuppression.service';

const suppressionMock = prisma.callSuppression as unknown as {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
};

const ORG = 'org-1';

beforeEach(() => {
    vi.clearAllMocks();
    suppressionMock.upsert.mockResolvedValue({});
});

describe('normalizeSuppressionKey', () => {
    it('reduz formatos diferentes do mesmo número à mesma chave', () => {
        const esperado = '+5511999998888';
        expect(normalizeSuppressionKey('(11) 99999-8888')).toBe(esperado);
        expect(normalizeSuppressionKey('011999998888')).toBe(esperado);
        expect(normalizeSuppressionKey('+55 11 99999 8888')).toBe(esperado);
    });

    it('devolve null para o que não é discável, em vez de inventar uma chave', () => {
        expect(normalizeSuppressionKey('ramal 22')).toBeNull();
        expect(normalizeSuppressionKey(null)).toBeNull();
    });
});

describe('isSuppressed', () => {
    it('consulta pela chave normalizada, não pelo texto cru do cadastro', async () => {
        suppressionMock.findUnique.mockResolvedValue({ id: 'sup-1' });

        await expect(isSuppressed(ORG, '(11) 99999-8888')).resolves.toBe(true);
        expect(suppressionMock.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { organizationId_phoneE164: { organizationId: ORG, phoneE164: '+5511999998888' } },
            }),
        );
    });

    it('devolve false quando o número não está na lista', async () => {
        suppressionMock.findUnique.mockResolvedValue(null);
        await expect(isSuppressed(ORG, '+5511999998888')).resolves.toBe(false);
    });

    // Sem número discável não há o que bloquear — e `callLead` já recusa esse lead antes daqui.
    it('nem consulta o banco para um telefone não normalizável', async () => {
        await expect(isSuppressed(ORG, 'ramal 22')).resolves.toBe(false);
        expect(suppressionMock.findUnique).not.toHaveBeenCalled();
    });
});

describe('recordOptOut', () => {
    it('grava o bloqueio com o número normalizado e a origem', async () => {
        await expect(recordOptOut({
            organizationId: ORG,
            phone: '(11) 99999-8888',
            source: 'call-opt-out',
            reason: 'Pedido na ligação',
            leadId: 'lead-9',
        })).resolves.toBe(true);

        expect(suppressionMock.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { organizationId_phoneE164: { organizationId: ORG, phoneE164: '+5511999998888' } },
            create: expect.objectContaining({
                phoneE164: '+5511999998888',
                source: 'call-opt-out',
                leadId: 'lead-9',
            }),
        }));
    });

    // O Hub reentrega o evento até receber 2xx: a segunda entrega não pode falhar nem sobrescrever
    // a evidência da primeira, que é a mais próxima do pedido real.
    it('é idempotente e preserva o registro original na reentrega', async () => {
        await recordOptOut({ organizationId: ORG, phone: '+5511999998888', source: 'call-opt-out' });

        expect(suppressionMock.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
    });

    it('não grava nada e avisa quando o telefone não é discável', async () => {
        await expect(recordOptOut({ organizationId: ORG, phone: 'n/d', source: 'manual' })).resolves.toBe(false);

        expect(suppressionMock.upsert).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalled();
    });
});
