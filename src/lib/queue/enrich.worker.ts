import { enrichCompanyData } from '../enrichment/apollo';
import { createLogger } from '../logger';

const logger = createLogger('enrich-worker');

export interface EnrichJobData {
    companyId: string;
    companyName: string;
    domain?: string;
}

export async function processEnrichJob(data: EnrichJobData) {
    logger.info(`Worker processando enriquecimento do job: ${data.companyId}`);

    try {
        const enriched = await enrichCompanyData(data.companyName, data.domain);
        logger.info(`Enriquecimento concluído para ${data.companyName}. Decisores encontrados: ${enriched.decisionMakers.length}`);
        return enriched;
    } catch (error) {
        logger.error(`Falha ao enriquecer empresa ${data.companyId}:`, error);
        throw error;
    }
}
