import cron from 'node-cron';
import { prisma } from '../../../lib/prisma.js';
import { VectorSearchService } from '../../intelligence/services/vector-search.service.js';
import { logger } from '../../../lib/logger.js';

export class ColdLeadsScannerService {
    static start() {
        cron.schedule('0 2 * * *', async () => {
            logger.info('Starting cold leads scan using RAG...');
            try {
                const coldLeads = await prisma.lead.findMany({
                    where: {
                        temperature: 'Frio'
                    },
                    include: {
                        company: true
                    }
                });

                for (const lead of coldLeads) {
                    if (lead.organizationId) {
                        const query = `Segmento: ${lead.company?.segment ?? 'geral'} Porte: ${lead.company?.size ?? 'geral'} Nome: ${lead.company?.tradeName ?? 'geral'}`;
                        const insights = await VectorSearchService.searchChunks(query, lead.organizationId, 3);
                        logger.info({ leadId: lead.id, insightsCount: insights.length }, 'RAG insights for cold lead');
                    }
                }
            } catch (error) {
                logger.error({ err: error }, 'Error scanning cold leads with RAG');
            }
        });
        logger.info('ColdLeadsScannerService scheduled.');
    }
}
