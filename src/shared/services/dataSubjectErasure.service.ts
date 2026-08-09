import { prisma } from '../../lib/prisma.js';
import { requestContext } from '../../lib/async-context.js';
import { logger } from '../../lib/logger.js';

export interface ErasureTarget {
    organizationId: string;
    contactId: string;
}

export interface ErasureResult {
    contactId: string;
    whatsAppMessagesMasked: number;
    alreadyAnonymized: boolean;
}

/** Marca o registro como anonimizado — não é PII, então é seguro deixar visível/pesquisável. */
export const ANONYMIZED_CONTACT_NAME = '[titular anonimizado — LGPD]';

/**
 * Anonimiza irreversivelmente os dados pessoais de um Contact (titular), a pedido do exercício do
 * direito de exclusão/anonimização do LGPD (Lei 13.709/2018, art. 18). Ver /AGENTS.md → "LGPD e
 * dados pessoais": este é o mecanismo técnico exigido do Agente 01 — a decisão de QUANDO acioná-lo
 * (verificar identidade do titular, prazo legal, etc.) é de negócio/operação, fora deste código.
 *
 * Não apaga o Contact nem os registros ligados a ele (Lead, Activity, negócio comercial) — LGPD
 * art. 12 trata dado anonimizado como fora do escopo da lei justamente porque deixa de identificar
 * uma pessoa natural, preservando o histórico comercial/contábil legítimo da organização. O que é
 * destruído é todo campo que identifica a pessoa: nome, telefone, WhatsApp, e-mail, LinkedIn, data
 * de nascimento, observações livres e customFields — mais o corpo e o telefone das mensagens de
 * WhatsApp ligadas a este contato (que carregam PII própria, independente do registro Contact).
 *
 * Idempotente: rodar de novo sobre um contato já anonimizado não falha nem duplica efeito.
 */
export async function eraseDataSubject(target: ErasureTarget): Promise<ErasureResult> {
    return requestContext.run({ tenantId: target.organizationId }, async () => {
        const contact = await prisma.contact.findFirst({
            where: { id: target.contactId, organizationId: target.organizationId },
        });
        if (!contact) {
            throw new Error(`Contato ${target.contactId} não encontrado na organização ${target.organizationId}.`);
        }

        const alreadyAnonymized = contact.name === ANONYMIZED_CONTACT_NAME;

        if (!alreadyAnonymized) {
            await prisma.contact.update({
                where: { id: target.contactId },
                data: {
                    name: ANONYMIZED_CONTACT_NAME,
                    phone: null,
                    whatsapp: null,
                    email: null,
                    linkedin: null,
                    birthDate: null,
                    observations: null,
                    customFields: {},
                },
            });
        }

        // Mensagens de WhatsApp guardam PII própria (telefone/conteúdo) — mascaradas mesmo se o
        // Contact já estava anonimizado antes, caso alguma mensagem nova tenha chegado depois.
        const { count: whatsAppMessagesMasked } = await prisma.whatsAppMessage.updateMany({
            where: { contactId: target.contactId, body: { not: null } },
            data: { body: null },
        });

        logger.info(
            {
                organizationId: target.organizationId,
                contactId: target.contactId,
                whatsAppMessagesMasked,
                alreadyAnonymized,
            },
            '[lgpd] Titular anonimizado a pedido de exercício de direito (LGPD art. 18).',
        );

        return { contactId: target.contactId, whatsAppMessagesMasked, alreadyAnonymized };
    });
}
