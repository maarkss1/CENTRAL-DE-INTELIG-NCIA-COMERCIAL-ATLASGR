import { prisma } from '../../../lib/prisma.js';

/**
 * Detecta se o lead respondeu desde que a cadência começou (CYC-008, onda-19). Cobre os dois
 * canais com transporte de entrada real e persistência de mensagem por `leadId`: WhatsApp
 * (`WhatsAppMessage.direction === 'inbound'`) e, desde CYC-003 (onda 26), e-mail
 * (`EmailMessage.direction === 'inbound'`, gravado só para réplicas genuínas — bounce/auto-reply
 * nunca chega a virar linha, ver `src/features/integrations/email/emailReply.webhook.ts`). Voz
 * ainda não tem transporte de entrada persistido — uma cadência com toques de voz que recebe
 * resposta só por ligação não vai parar sozinha por esta checagem.
 */
export async function hasLeadReplied(organizationId: string, leadId: string): Promise<boolean> {
    const [inboundWhatsApp, inboundEmail] = await Promise.all([
        prisma.whatsAppMessage.findFirst({
            where: { organizationId, leadId, direction: 'inbound' },
            select: { id: true },
        }),
        prisma.emailMessage.findFirst({
            where: { organizationId, leadId, direction: 'inbound' },
            select: { id: true },
        }),
    ]);
    return inboundWhatsApp !== null || inboundEmail !== null;
}
