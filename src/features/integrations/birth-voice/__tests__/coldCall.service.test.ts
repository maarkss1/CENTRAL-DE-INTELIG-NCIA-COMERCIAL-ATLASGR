import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG = 'org-1';

// `runColdCallCampaign` revalida as duas travas de habilitação a cada execução (ver comentário no
// próprio arquivo) — sem isto, todo teste abaixo pararia em `not-authorized` antes de examinar
// qualquer lead, já que o default real de SDR_COLD_CALL_ENABLED é `false`. Os testes específicos da
// revalidação ficam no describe `runColdCallCampaign — revalidação das duas travas` mais abaixo,
// que sobrescreve este mock por caso.
vi.mock('../../../../config/env.js', () => ({
    env: {
        SDR_COLD_CALL_ENABLED: true,
        SDR_COLD_CALL_ORGANIZATIONS: 'org-1',
        SDR_CALL_WINDOW_START: 9,
        SDR_CALL_WINDOW_END: 18,
        SDR_CALL_TIMEZONE: 'America/Sao_Paulo',
        SDR_MAX_ATTEMPTS_PER_LEAD: 3,
        SDR_RETRY_COOLDOWN_HOURS: 48,
        SDR_MAX_CALLS_PER_RUN: 10,
    },
}));

vi.mock('../../../../lib/prisma.js', () => ({
    prisma: {
        lead: { findMany: vi.fn(), update: vi.fn() },
        activity: { groupBy: vi.fn() },
        coldCallRun: { create: vi.fn() },
        organization: { findMany: vi.fn() },
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
import { runColdCallCampaign, enabledOrganizations } from '../coldCall.service.js';

const leadMock = prisma.lead as unknown as { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
const activityMock = prisma.activity as unknown as { groupBy: ReturnType<typeof vi.fn> };
const coldCallRunMock = prisma.coldCallRun as unknown as { create: ReturnType<typeof vi.fn> };
const mockCallLead = vi.mocked(callLead);

// Segunda-feira, 09:00 em São Paulo — dentro da janela padrão.
const DENTRO_DA_JANELA = new Date('2026-08-03T14:00:00Z');
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

// As duas travas de habilitação são independentes e revalidadas A CADA EXECUÇÃO (não só no momento
// em que o job foi agendado) — ver o comentário em runColdCallCampaign. Cada teste abaixo prova que
// UMA trava sozinha, mesmo com a outra permissiva, ainda impede a ligação.
describe('runColdCallCampaign — revalidação das duas travas de habilitação', () => {
    it('não disca quando SDR_COLD_CALL_ENABLED é false, mesmo com a organização na lista', async () => {
        const { env } = await import('../../../../config/env.js');
        (env as unknown as { SDR_COLD_CALL_ENABLED: boolean }).SDR_COLD_CALL_ENABLED = false;
        (env as unknown as { SDR_COLD_CALL_ORGANIZATIONS: string }).SDR_COLD_CALL_ORGANIZATIONS = ORG;
        leadMock.findMany.mockResolvedValue([lead('l1')]);

        const result = await runColdCallCampaign(ORG, DENTRO_DA_JANELA);

        expect(result.haltedBy).toBe('not-authorized');
        expect(result.called).toBe(0);
        expect(leadMock.findMany).not.toHaveBeenCalled();
        expect(mockCallLead).not.toHaveBeenCalled();

        (env as unknown as { SDR_COLD_CALL_ENABLED: boolean }).SDR_COLD_CALL_ENABLED = true;
    });

    it('não disca quando a organização não está em SDR_COLD_CALL_ORGANIZATIONS, mesmo com o recurso ligado', async () => {
        const { env } = await import('../../../../config/env.js');
        (env as unknown as { SDR_COLD_CALL_ENABLED: boolean }).SDR_COLD_CALL_ENABLED = true;
        (env as unknown as { SDR_COLD_CALL_ORGANIZATIONS: string }).SDR_COLD_CALL_ORGANIZATIONS = 'org-outra';
        leadMock.findMany.mockResolvedValue([lead('l1')]);

        const result = await runColdCallCampaign(ORG, DENTRO_DA_JANELA);

        expect(result.haltedBy).toBe('not-authorized');
        expect(leadMock.findMany).not.toHaveBeenCalled();
        expect(mockCallLead).not.toHaveBeenCalled();

        (env as unknown as { SDR_COLD_CALL_ORGANIZATIONS: string }).SDR_COLD_CALL_ORGANIZATIONS = ORG;
    });

    it('lista vazia em SDR_COLD_CALL_ORGANIZATIONS nunca autoriza por omissão (fail-closed)', async () => {
        const { env } = await import('../../../../config/env.js');
        (env as unknown as { SDR_COLD_CALL_ENABLED: boolean }).SDR_COLD_CALL_ENABLED = true;
        (env as unknown as { SDR_COLD_CALL_ORGANIZATIONS: string }).SDR_COLD_CALL_ORGANIZATIONS = '';

        const result = await runColdCallCampaign(ORG, DENTRO_DA_JANELA);

        expect(result.haltedBy).toBe('not-authorized');
        expect(mockCallLead).not.toHaveBeenCalled();

        (env as unknown as { SDR_COLD_CALL_ORGANIZATIONS: string }).SDR_COLD_CALL_ORGANIZATIONS = ORG;
    });

    it('continua discando normalmente quando as duas travas liberam a organização', async () => {
        const { env } = await import('../../../../config/env.js');
        (env as unknown as { SDR_COLD_CALL_ENABLED: boolean }).SDR_COLD_CALL_ENABLED = true;
        (env as unknown as { SDR_COLD_CALL_ORGANIZATIONS: string }).SDR_COLD_CALL_ORGANIZATIONS = ORG;
        leadMock.findMany.mockResolvedValue([lead('l1')]);

        const result = await runColdCallCampaign(ORG, DENTRO_DA_JANELA);

        expect(result.haltedBy).toBeUndefined();
        expect(result.called).toBe(1);
        expect(mockCallLead).toHaveBeenCalledTimes(1);
    });
});

describe('enabledOrganizations', () => {
    const organizationMock = prisma.organization as unknown as { findMany: ReturnType<typeof vi.fn> };

    it('devolve lista vazia quando SDR_COLD_CALL_ENABLED é false, mesmo com organizações listadas', async () => {
        const { env } = await import('../../../../config/env.js');
        (env as unknown as { SDR_COLD_CALL_ENABLED: boolean }).SDR_COLD_CALL_ENABLED = false;
        (env as unknown as { SDR_COLD_CALL_ORGANIZATIONS: string }).SDR_COLD_CALL_ORGANIZATIONS = 'org-1,org-2';

        await expect(enabledOrganizations()).resolves.toEqual([]);

        (env as unknown as { SDR_COLD_CALL_ENABLED: boolean }).SDR_COLD_CALL_ENABLED = true;
        (env as unknown as { SDR_COLD_CALL_ORGANIZATIONS: string }).SDR_COLD_CALL_ORGANIZATIONS = ORG;
    });

    it('devolve lista vazia quando SDR_COLD_CALL_ORGANIZATIONS está vazia, mesmo com o recurso ligado', async () => {
        const { env } = await import('../../../../config/env.js');
        (env as unknown as { SDR_COLD_CALL_ENABLED: boolean }).SDR_COLD_CALL_ENABLED = true;
        (env as unknown as { SDR_COLD_CALL_ORGANIZATIONS: string }).SDR_COLD_CALL_ORGANIZATIONS = '';

        await expect(enabledOrganizations()).resolves.toEqual([]);

        (env as unknown as { SDR_COLD_CALL_ORGANIZATIONS: string }).SDR_COLD_CALL_ORGANIZATIONS = ORG;
    });

    it('devolve a lista explícita quando as duas travas liberam', async () => {
        const { env } = await import('../../../../config/env.js');
        (env as unknown as { SDR_COLD_CALL_ENABLED: boolean }).SDR_COLD_CALL_ENABLED = true;
        (env as unknown as { SDR_COLD_CALL_ORGANIZATIONS: string }).SDR_COLD_CALL_ORGANIZATIONS = 'org-1, org-2 ';

        await expect(enabledOrganizations()).resolves.toEqual(['org-1', 'org-2']);

        (env as unknown as { SDR_COLD_CALL_ORGANIZATIONS: string }).SDR_COLD_CALL_ORGANIZATIONS = ORG;
    });

    it('"*" digitado explicitamente autoriza todas as organizações do banco', async () => {
        const { env } = await import('../../../../config/env.js');
        (env as unknown as { SDR_COLD_CALL_ENABLED: boolean }).SDR_COLD_CALL_ENABLED = true;
        (env as unknown as { SDR_COLD_CALL_ORGANIZATIONS: string }).SDR_COLD_CALL_ORGANIZATIONS = '*';
        organizationMock.findMany.mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }, { id: 'org-3' }]);

        await expect(enabledOrganizations()).resolves.toEqual(['org-1', 'org-2', 'org-3']);

        (env as unknown as { SDR_COLD_CALL_ORGANIZATIONS: string }).SDR_COLD_CALL_ORGANIZATIONS = ORG;
    });
});
