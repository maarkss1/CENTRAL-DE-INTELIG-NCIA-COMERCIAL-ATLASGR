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

// Opt-out unificado entre canais (Agente 17, ver `17-para-05-06-12-contrato-optout.md`) — mockado
// diretamente para este arquivo testar só a combinação das duas fontes, sem depender do Prisma real
// por trás de `PrismaOptOutRepository`.
const isOptedOutMock = vi.fn().mockResolvedValue(false);
const recordUnifiedOptOutMock = vi.fn().mockResolvedValue({ id: 'optout-1' });
vi.mock('@/features/cadence/application/optOutService', () => ({
    isOptedOut: (...args: unknown[]) => isOptedOutMock(...args),
    recordOptOut: (...args: unknown[]) => recordUnifiedOptOutMock(...args),
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
    isOptedOutMock.mockResolvedValue(false);
    recordUnifiedOptOutMock.mockResolvedValue({ id: 'optout-1' });
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

    it('devolve false quando o número não está na lista e não há opt-out unificado', async () => {
        suppressionMock.findUnique.mockResolvedValue(null);
        await expect(isSuppressed(ORG, '+5511999998888')).resolves.toBe(false);
    });

    // Sem nenhum identificador (nem telefone normalizável, nem leadId/email) não há o que bloquear
    // — e `callLead` já recusa esse lead antes daqui.
    it('nem consulta o banco para um telefone não normalizável sem contexto', async () => {
        await expect(isSuppressed(ORG, 'ramal 22')).resolves.toBe(false);
        expect(suppressionMock.findUnique).not.toHaveBeenCalled();
        expect(isOptedOutMock).not.toHaveBeenCalled();
    });

    // O ponto central do handoff 17-para-05-06-12: `CallSuppression` sozinho nunca soube de um
    // opt-out feito por e-mail ou WhatsApp. Agora `isSuppressed` também bloqueia nesse caso.
    it('bloqueia via opt-out unificado (OptOutRecord) mesmo sem hit em CallSuppression', async () => {
        suppressionMock.findUnique.mockResolvedValue(null);
        isOptedOutMock.mockResolvedValue(true);

        await expect(isSuppressed(ORG, '+5511999998888')).resolves.toBe(true);
        expect(isOptedOutMock).toHaveBeenCalledWith(
            expect.anything(),
            ORG,
            { leadId: null, email: null, phoneE164: '+5511999998888' },
            'voice',
        );
    });

    it('continua bloqueando via CallSuppression mesmo sem opt-out unificado', async () => {
        suppressionMock.findUnique.mockResolvedValue({ id: 'sup-1' });
        isOptedOutMock.mockResolvedValue(false);

        await expect(isSuppressed(ORG, '+5511999998888')).resolves.toBe(true);
    });

    // leadId/email do contexto fortalecem o casamento do opt-out unificado — sem isso, um opt-out
    // registrado só por e-mail (sem o mesmo telefone em comum) não seria encontrado.
    it('propaga leadId/email do contexto para o casamento do opt-out unificado', async () => {
        suppressionMock.findUnique.mockResolvedValue(null);

        await isSuppressed(ORG, '+5511999998888', { leadId: 'lead-9', email: 'ana@exemplo.com' });

        expect(isOptedOutMock).toHaveBeenCalledWith(
            expect.anything(),
            ORG,
            { leadId: 'lead-9', email: 'ana@exemplo.com', phoneE164: '+5511999998888' },
            'voice',
        );
    });

    // leadId/email sozinhos (sem telefone discável) ainda devem consultar o opt-out unificado —
    // é o caso de um lead cujo telefone no cadastro está mal formatado mas que já opinou por e-mail.
    it('consulta o opt-out unificado por leadId mesmo sem telefone normalizável', async () => {
        isOptedOutMock.mockResolvedValue(true);

        await expect(isSuppressed(ORG, 'ramal 22', { leadId: 'lead-9' })).resolves.toBe(true);
        expect(suppressionMock.findUnique).not.toHaveBeenCalled();
        expect(isOptedOutMock).toHaveBeenCalledWith(
            expect.anything(),
            ORG,
            { leadId: 'lead-9', email: null, phoneE164: null },
            'voice',
        );
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
        expect(recordUnifiedOptOutMock).not.toHaveBeenCalled();
    });

    // Ponto 2 do handoff 17-para-05-06-12: todo bloqueio de voz novo também vira um OptOutRecord
    // (scope 'voice'), para WhatsApp/e-mail (06/05) enxergarem — sem desligar CallSuppression.
    it('também grava no registro unificado de opt-out (scope voice, originChannel voice)', async () => {
        await recordOptOut({
            organizationId: ORG,
            phone: '(11) 99999-8888',
            source: 'call-opt-out',
            reason: 'Pedido na ligação (transcript): "não me ligue mais"',
            evidence: 'não me ligue mais',
            leadId: 'lead-9',
        });

        expect(recordUnifiedOptOutMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                organizationId: ORG,
                scope: 'voice',
                subject: { leadId: 'lead-9', phoneE164: '+5511999998888' },
                originChannel: 'voice',
                reason: 'Pedido na ligação (transcript): "não me ligue mais"',
                evidence: 'não me ligue mais',
            }),
        );
    });

    // A escrita unificada é melhor esforço: CallSuppression (fonte de verdade de voz) já foi
    // gravado e não pode deixar de valer porque a gravação em OptOutRecord falhou.
    it('não falha o bloqueio de voz quando a gravação do opt-out unificado falha', async () => {
        recordUnifiedOptOutMock.mockRejectedValue(new Error('Banco indisponível'));

        await expect(recordOptOut({
            organizationId: ORG,
            phone: '+5511999998888',
            source: 'call-opt-out',
        })).resolves.toBe(true);

        expect(suppressionMock.upsert).toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalled();
    });
});
