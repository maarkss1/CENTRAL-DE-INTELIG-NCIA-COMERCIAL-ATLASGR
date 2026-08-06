import type { WAMessage } from '@whiskeysockets/baileys';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { toE164BR } from '../../../lib/phone.js';
import { scheduleConversationAnalysis } from '../../../lib/queue/whatsappSignal.worker.js';

/** Grupos (`@g.us`) e o próprio status (`status@broadcast`) não correspondem a um contato do CRM. */
function isIndividualChat(remoteJid: string | null | undefined): boolean {
    return !!remoteJid && remoteJid.endsWith('@s.whatsapp.net');
}

/** Extrai o texto de uma mensagem do Baileys, quando ela for de texto simples. */
export function extractMessageText(message: WAMessage): string | null {
    const content = message.message;
    if (!content) return null;
    return content.conversation
        || content.extendedTextMessage?.text
        || content.imageMessage?.caption
        || content.videoMessage?.caption
        || null;
}

/**
 * Encontra o Contact deste tenant cujo telefone/whatsapp cadastrado bate com o número informado.
 *
 * Compara pelos últimos 9 dígitos em vez de exigir formato idêntico: o cadastro do Contact aceita
 * texto livre (com/sem "+55", com/sem o 9 inicial de celular), então uma igualdade exata deixaria
 * de casar contatos reais por uma diferença só de formatação.
 */
async function findContactByPhone(organizationId: string, phoneE164: string) {
    const digits = phoneE164.replace(/\D/g, '');
    const significant = digits.slice(-9);
    if (significant.length < 8) return null;

    const [found] = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Contact"
        WHERE "organizationId" = ${organizationId}
          AND (
            regexp_replace(COALESCE(phone, ''), '\D', '', 'g') LIKE ${'%' + significant}
            OR regexp_replace(COALESCE(whatsapp, ''), '\D', '', 'g') LIKE ${'%' + significant}
          )
        LIMIT 1
    `;
    return found ?? null;
}

/** Lead em aberto mais recente deste contato — mensagens ficam associadas a ele quando existir um. */
async function findOpenLeadForContact(organizationId: string, contactId: string) {
    return prisma.lead.findFirst({
        where: {
            organizationId,
            contactId,
            status: { notIn: ['Negocios_Ganhos', 'Negocios_Perdidos', 'Lead_Desqualificado'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
    });
}

export interface PersistWhatsAppMessageInput {
    organizationId: string;
    waMessageId: string;
    direction: 'inbound' | 'outbound';
    remoteJid: string | null | undefined;
    body: string | null;
}

/**
 * Persiste uma mensagem do WhatsApp (recebida ou enviada) e, quando o número corresponde a um
 * contato já cadastrado, vincula a um Lead em aberto e registra no timeline dele.
 *
 * Idempotente: `waMessageId` é único por organização, então uma reentrega do mesmo evento (comum
 * após reconexão do Baileys) não duplica o registro nem o evento de timeline.
 */
export async function persistWhatsAppMessage(input: PersistWhatsAppMessageInput): Promise<void> {
    if (!isIndividualChat(input.remoteJid)) return;

    const phoneE164 = toE164BR(input.remoteJid!.replace('@s.whatsapp.net', ''));
    if (!phoneE164) return;

    const existing = await prisma.whatsAppMessage.findUnique({
        where: { organizationId_waMessageId: { organizationId: input.organizationId, waMessageId: input.waMessageId } },
        select: { id: true },
    });
    if (existing) return;

    const contact = await findContactByPhone(input.organizationId, phoneE164);
    const lead = contact ? await findOpenLeadForContact(input.organizationId, contact.id) : null;

    await prisma.whatsAppMessage.create({
        data: {
            organizationId: input.organizationId,
            waMessageId: input.waMessageId,
            direction: input.direction,
            phoneE164,
            body: input.body,
            contactId: contact?.id,
            leadId: lead?.id,
        },
    });

    if (lead && input.direction === 'inbound') {
        await prisma.timelineEvent.create({
            data: {
                type: 'whatsapp',
                description: input.body
                    ? `Mensagem recebida no WhatsApp: "${input.body.slice(0, 200)}"`
                    : 'Mensagem recebida no WhatsApp (mídia sem legenda).',
                leadId: lead.id,
            },
        }).catch((error) => {
            // O registro da mensagem já foi salvo — a falha aqui não pode apagar essa evidência.
            logger.error({ err: error, leadId: lead.id }, 'Falha ao registrar mensagem de WhatsApp no timeline do lead.');
        });

        await scheduleConversationAnalysis(lead.id, input.organizationId);
    }
}
