import { Worker, Job, Queue } from 'bullmq';
import { connection } from './redis.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { apolloService } from '../enrichment/apollo.js';
import { requestContext } from '../async-context.js';

export const ENRICH_QUEUE_NAME = 'enrich-lead';
export const enrichQueue = new Queue(ENRICH_QUEUE_NAME, { connection });

interface EnrichJobData {
    leadId: string;
    tenantId: string;
}

export function createEnrichWorker() {
    const worker = new Worker<EnrichJobData>(
        ENRICH_QUEUE_NAME,
        async (job: Job<EnrichJobData>) => {
            logger.info({ jobId: job.id, leadId: job.data.leadId }, 'Processando job de enriquecimento');
            const { leadId, tenantId } = job.data;

            try {
                // Executar sob o contexto RLS do tenant
                await requestContext.run({ tenantId }, async () => {
                    const lead = await prisma.lead.findUnique({
                        where: { id: leadId },
                        include: { company: true }
                    });

                    if (!lead || !lead.company) {
                        logger.warn(`Lead ${leadId} ou Empresa não encontrado para enriquecimento.`);
                        return;
                    }

                    const company = lead.company;
                    
                    // Extrair domínio (mock simple para teste)
                    let domain = (company as Record<string, unknown>).domain as string | undefined;
                    if (!domain && company.website) {
                        try {
                            const url = new URL(company.website.startsWith('http') ? company.website : `https://${company.website}`);
                            domain = url.hostname.replace('www.', '');
                        } catch (_e) {
                            domain = company.website;
                        }
                    }

                    if (!domain) {
                        logger.warn(`Empresa ${company.id} não possui domínio para enriquecer na Apollo.`);
                        return;
                    }

                    const enrichmentData = await apolloService.enrichCompany(domain, company.tradeName);

                    // Salvar dados no banco
                    if (Object.keys(enrichmentData).length > 0) {
                        await prisma.company.update({
                            where: { id: company.id },
                            data: {
                                size: enrichmentData.revenue,
                                technologies: enrichmentData.technologies || [],
                                observations: enrichmentData.description || 'Nenhuma descrição encontrada.',
                                segment: enrichmentData.industry || company.segment
                            }
                        });
                        logger.info(`Empresa ${company.tradeName} enriquecida com sucesso!`);
                    }
                });
            } catch (error: unknown) {
                logger.error({ err: error, jobId: job.id }, 'Falha no job de enriquecimento');
                throw error;
            }
        },
        { connection, concurrency: 3 }
    );

    worker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Enrich Worker job permanently failed');
    });

    return worker;
}
