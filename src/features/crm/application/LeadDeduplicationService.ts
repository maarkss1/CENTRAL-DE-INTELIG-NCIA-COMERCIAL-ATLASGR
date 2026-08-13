import { PrismaClient } from '@prisma/client';
import { logger } from '../../../lib/logger';

const prisma = new PrismaClient();

export class LeadDeduplicationService {
    /**
     * Busca leads duplicados com o mesmo contato
     * e os mescla, preservando o lead de maior valor.
     */
    async deduplicateByEmail(organizationId: string): Promise<{ merged: number }> {
        try {
            // Conta agrupamentos de contactId com mais de 1 lead
            const duplicates = await prisma.lead.groupBy({
                by: ['contactId'],
                where: {
                    organizationId,
                    contactId: { not: null },
                },
                having: {
                    contactId: {
                        _count: {
                            gt: 1,
                        },
                    },
                },
            });

            if (duplicates.length === 0) {
                return { merged: 0 };
            }

            let mergedCount = 0;

            for (const dup of duplicates) {
                if (!dup.contactId) continue;
                
                const leads = await prisma.lead.findMany({
                    where: { organizationId, contactId: dup.contactId },
                    orderBy: { amount: 'desc' }, // Mantém o lead com maior valor comercial
                });

                if (leads.length > 1) {
                    const duplicateIds = leads.slice(1).map(l => l.id);

                    // Deleta os leads duplicados
                    await prisma.lead.deleteMany({
                        where: {
                            id: { in: duplicateIds },
                            organizationId,
                        },
                    });

                    mergedCount += duplicateIds.length;
                    logger.info(`Deduplicated ${duplicateIds.length} leads for contact ${dup.contactId}`);
                }
            }

            return { merged: mergedCount };
        } catch (error) {
            logger.error({ err: error, organizationId }, 'Falha na deduplicação de leads');
            throw error;
        }
    }
}
