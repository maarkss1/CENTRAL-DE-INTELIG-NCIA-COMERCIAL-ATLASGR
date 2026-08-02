/**
 * O ponto por onde toda ligação passa — rota manual, automação e o futuro worker de prospecção
 * fria. É aqui que o opt-out precisa ser respeitado; um bloqueio checado só na tela seria
 * contornado pela primeira campanha automática.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config/env', () => ({
    env: {
        BIRTH_VOICES_URL: 'http://hub.local',
        BIRTH_VOICES_API_KEY: 'chave',
        BIRTH_VOICES_AGENT_ID: 'agente-1',
        PUBLIC_BASE_URL: 'http://prospector.local',
    },
}));

vi.mock('@/lib/prisma', () => ({
    prisma: { lead: { findFirst: vi.fn() } },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/features/integrations/birth-voice/callSuppression.service', () => ({
    isSuppressed: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { isSuppressed } from '@/features/integrations/birth-voice/callSuppression.service';
import {
    callLead,
    SuppressedNumberError,
    NoPhoneNumberError,
} from '@/features/integrations/birth-voice/birthVoice.service';

const leadMock = prisma.lead as unknown as { findFirst: ReturnType<typeof vi.fn> };
const mockIsSuppressed = vi.mocked(isSuppressed);

const ORG = 'org-1';

function leadComTelefone(phone: string | null = '(11) 99999-8888') {
    return {
        id: 'lead-9',
        contact: { name: 'Ana', phone, whatsapp: null },
        company: { tradeName: 'Transportes X', legalName: null, phones: [] },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockIsSuppressed.mockResolvedValue(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sessionId: 'sess-1', callSid: 'CA1', status: 'queued' }),
    }));
});

describe('callLead', () => {
    it('disca para o telefone do contato quando não há bloqueio', async () => {
        leadMock.findFirst.mockResolvedValue(leadComTelefone());

        await expect(callLead(ORG, 'lead-9')).resolves.toMatchObject({ callSid: 'CA1' });

        expect(mockIsSuppressed).toHaveBeenCalledWith(ORG, '+5511999998888');
        expect(fetch).toHaveBeenCalledOnce();
    });

    it('recusa a ligação e não chama o Hub quando o número tem opt-out', async () => {
        leadMock.findFirst.mockResolvedValue(leadComTelefone());
        mockIsSuppressed.mockResolvedValue(true);

        await expect(callLead(ORG, 'lead-9')).rejects.toBeInstanceOf(SuppressedNumberError);
        expect(fetch).not.toHaveBeenCalled();
    });

    // A ordem importa: sem número discável não há chave de bloqueio para consultar, então este
    // caminho tem de sair antes — e sem gastar uma consulta ao banco.
    it('recusa antes de consultar a lista quando o lead não tem número discável', async () => {
        leadMock.findFirst.mockResolvedValue(leadComTelefone('ramal 22'));

        await expect(callLead(ORG, 'lead-9')).rejects.toBeInstanceOf(NoPhoneNumberError);
        expect(mockIsSuppressed).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });
});
