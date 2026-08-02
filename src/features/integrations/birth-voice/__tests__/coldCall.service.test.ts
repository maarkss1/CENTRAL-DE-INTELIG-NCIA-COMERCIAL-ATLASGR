import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/prisma.js', () => ({
    prisma: {
        lead: { findMany: vi.fn(), update: vi.fn() },
        activity: { groupBy: vi.fn() },
        coldCallRun: { create: vi.fn() },
    },
}));

vi.mock('../../../../lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../birthVoice.service.js', () => ({
    callLead: vi.fn(),
    NoPhoneNumberError: class NoPhoneNumberError extends Error {},
    SuppressedNumberError: class SuppressedNumberError extends Error {},
    BirthVoiceNotConfiguredError: class BirthVoiceNotConfiguredError extends Error {},
}));

import { prisma } from '../../../../lib/prisma.js';
import {
    callLead,
    NoPhoneNumberError,
    SuppressedNumberError,
    BirthVoiceNotConfiguredError,
} from '../birthVoice.service.js';
import { runColdCallCampaign } from '../coldCall.service.js';

const leadMock = prisma.lead as unknown as { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
const activityMock = prisma.activity as unknown as { groupBy: ReturnType<typeof vi.fn> };
const coldCallRunMock = prisma.coldCallRun as unknown as { create: ReturnType<typeof vi.fn> };
const mockCallLead = vi.mocked(callLead);

const ORG = 'org-1';
// Segunda-feira, 09:00 em São Paulo — dentro da janela padrão.
const DENTRO_DA_JANELA = new Date('2026-08-03T12:00:00Z');
// Sábado, mesmo horário.
const FIM_DE_SEMANA = new Date('2026-08-01T12:00:00Z');

function lead(id: string, lastInteraction: Date | null = null) {
    return { id, lastInteraction };
}

beforeEach(() => {
    vi.clearAllMocks();
    leadMock.update.mockResolvedValue({});
    activityMock.groupBy.mockResolvedValue([]);
    coldCallRunMock.create.mockResolvedValue({});
    mockCallLead.mockResolvedValue({ sessionId: 's', callSid: 'CA', status: 'queued' });
});

describe('runColdCallCampaign', () => {
    it('não consulta leads fora da janela de discagem, mas registra a execução', async () => {
        const result = await runColdCallCampaign(ORG, FIM_DE_SEMANA);

        expect(result.haltedBy).toBe('outside-window');
        expect(result.called).toBe(0);
        expect(leadMock.findMany).not.toHaveBeenCalled();
        // Sem isto, a tela de acompanhamento não teria como distinguir "não rodou" de "rodou e não
        // achou ninguém para ligar".
        expect(coldCallRunMock.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ organizationId: ORG, haltedBy: 'outside-window' }),
        });
    });

    it('registra o resumo da execução para a tela de acompanhamento', async () => {
        leadMock.findMany.mockResolvedValue([lead('l1')]);

        await runColdCallCampaign(ORG, DENTRO_DA_JANELA);

        expect(coldCallRunMock.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: ORG,
                scanned: 1,
                called: 1,
                haltedBy: null,
            }),
        });
    });

    it('disca para os leads elegíveis e marca a interação', async () => {
        leadMock.findMany.mockResolvedValue([lead('l1'), lead('l2')]);

        const result = await runColdCallCampaign(ORG, DENTRO_DA_JANELA);

        expect(result.called).toBe(2);
        expect(mockCallLead).toHaveBeenCalledWith(ORG, 'l1');
        expect(mockCallLead).toHaveBeenCalledWith(ORG, 'l2');
        // Sem isso, um webhook que nunca chegasse faria a campanha rediscar o lead a cada execução.
        expect(leadMock.update).toHaveBeenCalledWith({
            where: { id: 'l1' },
            data: { lastInteraction: DENTRO_DA_JANELA },
        });
    });

    it('pula quem já esgotou as tentativas', async () => {
        leadMock.findMany.mockResolvedValue([lead('l1')]);
        activityMock.groupBy.mockResolvedValue([{ leadId: 'l1', _count: { _all: 3 } }]);

        const result = await runColdCallCampaign(ORG, DENTRO_DA_JANELA);

        expect(result.called).toBe(0);
        expect(result.skipped['max-attempts']).toBe(1);
        expect(mockCallLead).not.toHaveBeenCalled();
    });

    it('pula quem foi contatado dentro do intervalo mínimo', async () => {
        const ontem = new Date(DENTRO_DA_JANELA.getTime() - 24 * 3_600_000);
        leadMock.findMany.mockResolvedValue([lead('l1', ontem)]);

        const result = await runColdCallCampaign(ORG, DENTRO_DA_JANELA);

        expect(result.skipped.cooldown).toBe(1);
        expect(mockCallLead).not.toHaveBeenCalled();
    });

    // Opt-out e ausência de telefone são resultados esperados numa base fria, não defeitos — e
    // precisam ser distinguíveis no relatório para a operação saber o que corrigir.
    it('contabiliza bloqueio e falta de telefone separadamente, sem interromper a campanha', async () => {
        leadMock.findMany.mockResolvedValue([lead('l1'), lead('l2'), lead('l3')]);
        mockCallLead
            .mockRejectedValueOnce(new SuppressedNumberError('bloqueado'))
            .mockRejectedValueOnce(new NoPhoneNumberError('sem telefone'))
            .mockResolvedValueOnce({ sessionId: 's', callSid: 'CA', status: 'queued' });

        const result = await runColdCallCampaign(ORG, DENTRO_DA_JANELA);

        expect(result.skipped.suppressed).toBe(1);
        expect(result.skipped['no-phone']).toBe(1);
        expect(result.called).toBe(1);
    });

    it('interrompe a execução inteira quando o SDR não está configurado', async () => {
        leadMock.findMany.mockResolvedValue([lead('l1'), lead('l2')]);
        mockCallLead.mockRejectedValue(new BirthVoiceNotConfiguredError('faltando BIRTH_VOICES_URL'));

        const result = await runColdCallCampaign(ORG, DENTRO_DA_JANELA);

        expect(result.haltedBy).toBe('not-configured');
        // Parou no primeiro em vez de repetir o mesmo erro para cada lead da lista.
        expect(mockCallLead).toHaveBeenCalledTimes(1);
    });

    it('respeita o teto de ligações por execução', async () => {
        // O padrão é 10 por execução; 12 candidatos elegíveis devem render exatamente 10 ligações.
        leadMock.findMany.mockResolvedValue(Array.from({ length: 12 }, (_, i) => lead(`l${i}`)));

        const result = await runColdCallCampaign(ORG, DENTRO_DA_JANELA);

        expect(result.called).toBe(10);
        expect(mockCallLead).toHaveBeenCalledTimes(10);
    });
});
