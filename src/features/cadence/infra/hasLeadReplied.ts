import { prisma } from '../../../lib/prisma.js';

/**
 * Detecta se o lead respondeu desde que a cadência começou (CYC-008, onda-19). Hoje só enxerga
 * réplica por WhatsApp (`WhatsAppMessage.direction === 'inbound'`) — é o único canal deste
 * projeto com transporte de entrada real e persistência de mensagem por `leadId`. Réplica por
 * e-mail (CYC-003) não é detectável ainda: não existe IMAP/webhook de e-mail de entrada no
 * projeto (ver `docs/CADENCE-CYCLE-AUDIT.md`) — uma cadência com toques de e-mail que recebe
 * resposta só por e-mail não vai parar sozinha por esta checagem até esse gap ser fechado.
 */
export async function hasLeadReplied(organizationId: string, leadId: string): Promise<boolean> {
    const inboundReply = await prisma.whatsAppMessage.findFirst({
        where: { organizationId, leadId, direction: 'inbound' },
        select: { id: true },
    });
    return inboundReply !== null;
}
