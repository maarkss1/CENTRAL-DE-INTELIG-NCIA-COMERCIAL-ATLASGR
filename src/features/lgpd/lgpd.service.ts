import { prisma } from '../../lib/prisma.js';
import { eraseDataSubject } from '../../shared/services/dataSubjectErasure.service.js';
import { logger } from '../../lib/logger.js';

export class LgpdService {
    /**
     * Apaga / Anonimiza dados de um titular (LGPD Art. 18)
     */
    async eraseContact(organizationId: string, contactId: string) {
        return await eraseDataSubject({ organizationId, contactId });
    }

    /**
     * Exporta os dados do titular em JSON estruturado (LGPD Portabilidade - Art. 18 V)
     */
    async exportContactData(organizationId: string, contactId: string) {
        const contact = await prisma.contact.findFirst({
            where: { id: contactId, organizationId },
            include: {
                leads: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        temperature: true,
                        createdAt: true,
                    }
                },
                whatsAppMessages: {
                    select: {
                        id: true,
                        direction: true,
                        receivedAt: true,
                    }
                }
            }
        });

        if (!contact) {
            throw new Error('Contato não encontrado.');
        }

        logger.info({ organizationId, contactId }, '[LGPD] Exportação de dados do titular realizada');

        return {
            exportTimestamp: new Date().toISOString(),
            contact: {
                id: contact.id,
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
                whatsapp: contact.whatsapp,
                linkedin: contact.linkedin,
                birthDate: contact.birthDate,
                observations: contact.observations,
                customFields: contact.customFields,
                createdAt: contact.createdAt,
            },
            associatedLeads: contact.leads.map((l) => ({
                id: l.id,
                title: l.title,
                status: l.status,
                temperature: l.temperature,
                createdAt: l.createdAt
            })),
            whatsAppMessagesCount: contact.whatsAppMessages.length
        };
    }
}

export const lgpdService = new LgpdService();
