import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/prisma.js', () => ({
    prisma: {
        whatsAppMessage: { findUnique: vi.fn(), create: vi.fn() },
        lead: { findFirst: vi.fn() },
        timelineEvent: { create: vi.fn() },
        $queryRaw: vi.fn(),
    },
}));

vi.mock('../../../../lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from '../../../../lib/prisma.js';
import { extractMessageText, persistWhatsAppMessage } from '../whatsappMessage.service.js';

const messageMock = prisma.whatsAppMessage as unknown as { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
const leadMock = prisma.lead as unknown as { findFirst: ReturnType<typeof vi.fn> };
const timelineMock = prisma.timelineEvent as unknown as { create: ReturnType<typeof vi.fn> };
const queryRawMock = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;

const ORG = 'org-1';

beforeEach(() => {
    vi.clearAllMocks();
    messageMock.findUnique.mockResolvedValue(null);
    messageMock.create.mockResolvedValue({});
    leadMock.findFirst.mockResolvedValue(null);
    timelineMock.create.mockResolvedValue({});
    queryRawMock.mockResolvedValue([]);
});

describe('extractMessageText', () => {
    it('extrai texto simples de conversation', () => {
        expect(extractMessageText({ message: { conversation: 'Oi' } } as never)).toBe('Oi');
    });

    it('extrai texto de extendedTextMessage', () => {
        expect(extractMessageText({ message: { extendedTextMessage: { text: 'Olá' } } } as never)).toBe('Olá');
    });

    it('devolve null para mensagem sem conteúdo de texto (ex: figurinha)', () => {
        expect(extractMessageText({ message: { stickerMessage: {} } } as never)).toBeNull();
    });
});

describe('persistWhatsAppMessage', () => {
    it('ignora mensagens de grupo — não correspondem a um contato do CRM', async () => {
        await persistWhatsAppMessage({
            organizationId: ORG,
            waMessageId: 'm1',
            direction: 'inbound',
            remoteJid: '123456-group@g.us',
            body: 'oi pessoal',
        });

        expect(messageMock.create).not.toHaveBeenCalled();
    });

    it('é idempotente: não grava de novo uma mensagem já persistida', async () => {
        messageMock.findUnique.mockResolvedValue({ id: 'existing' });

        await persistWhatsAppMessage({
            organizationId: ORG,
            waMessageId: 'm1',
            direction: 'inbound',
            remoteJid: '5511999998888@s.whatsapp.net',
            body: 'oi',
        });

        expect(messageMock.create).not.toHaveBeenCalled();
    });

    it('persiste sem contato/lead quando o número não corresponde a ninguém cadastrado', async () => {
        queryRawMock.mockResolvedValue([]);

        await persistWhatsAppMessage({
            organizationId: ORG,
            waMessageId: 'm1',
            direction: 'inbound',
            remoteJid: '5511999998888@s.whatsapp.net',
            body: 'oi',
        });

        expect(messageMock.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ organizationId: ORG, phoneE164: '+5511999998888', contactId: undefined, leadId: undefined }),
        });
        expect(timelineMock.create).not.toHaveBeenCalled();
    });

    it('vincula ao lead em aberto do contato e registra no timeline quando o número bate', async () => {
        queryRawMock.mockResolvedValue([{ id: 'cont-1' }]);
        leadMock.findFirst.mockResolvedValue({ id: 'lead-1' });

        await persistWhatsAppMessage({
            organizationId: ORG,
            waMessageId: 'm1',
            direction: 'inbound',
            remoteJid: '5511999998888@s.whatsapp.net',
            body: 'Quero saber mais sobre o produto',
        });

        expect(messageMock.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ contactId: 'cont-1', leadId: 'lead-1' }),
        });
        expect(timelineMock.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ type: 'whatsapp', leadId: 'lead-1' }),
        });
    });

    it('não registra timeline para mensagem enviada por nós mesmos (outbound)', async () => {
        queryRawMock.mockResolvedValue([{ id: 'cont-1' }]);
        leadMock.findFirst.mockResolvedValue({ id: 'lead-1' });

        await persistWhatsAppMessage({
            organizationId: ORG,
            waMessageId: 'm2',
            direction: 'outbound',
            remoteJid: '5511999998888@s.whatsapp.net',
            body: 'Obrigado pelo contato!',
        });

        expect(messageMock.create).toHaveBeenCalled();
        expect(timelineMock.create).not.toHaveBeenCalled();
    });
});
