import { logger } from '../logger.js';
import { getPaidProspectingKey } from '../../config/prospecting-integrations.js';
import { fetchWithTimeout } from '../http.js';

const APOLLO_ENRICH_TIMEOUT_MS = 15_000;

export interface ApolloEnrichmentData {
    revenue?: string;
    headcount?: number;
    technologies?: string[];
    description?: string;
    industry?: string;
}

interface ApolloTechnology {
    name: string;
}

interface ApolloOrganization {
    estimated_num_employees?: number;
    current_technologies?: ApolloTechnology[];
    short_description?: string;
    description?: string;
    industry?: string;
}

interface ApolloApiResponse {
    organization?: ApolloOrganization;
}

export class ApolloService {
    // Apollo API real fica em /api/v1, não /v1 — usar /v1 devolve 404 e o enriquecimento
    // falha silenciosamente (mesmo bug já corrigido para a busca de empresas/decisores, ver
    // src/features/prospecting/services/apollo/client.ts).
    private baseUrl = 'https://api.apollo.io/api/v1';

    private getApiKey(): string {
        // Mesma trava de opt-in dos demais provedores pagos: só usa a chave real quando
        // PROSPECTING_PROVIDER_MODE=hybrid (ver config/prospecting-integrations.ts).
        return getPaidProspectingKey('APOLLO_API_KEY') || '';
    }

    /**
     * Busca dados da empresa no Apollo.io
     * Sem API key válida (PROSPECTING_PROVIDER_MODE != hybrid ou APOLLO_API_KEY ausente), retorna
     * dados Mockados para evitar custos — mesmo critério de opt-in usado pelos demais provedores
     * pagos (config/prospecting-integrations.ts), independente do NODE_ENV.
     */
    async enrichCompany(domain: string, companyName: string): Promise<ApolloEnrichmentData> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            logger.debug({ domain, companyName }, '[Apollo Mock] Enriquecendo empresa...');
            // Simula delay de rede
            await new Promise(resolve => setTimeout(resolve, 1500));

            return {
                revenue: '$1M - $10M',
                headcount: 45,
                technologies: ['Salesforce', 'React', 'AWS'],
                description: `Transportadora fictícia enriquecida pelo Mock Apollo. Especializada em cargas fracionadas.`,
                industry: 'Logistics and Supply Chain'
            };
        }

        try {
            logger.debug({ domain }, '[Apollo Real] Buscando dados...');
            const response = await fetchWithTimeout(`${this.baseUrl}/organizations/enrich?domain=${domain}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'X-Api-Key': apiKey
                }
            }, APOLLO_ENRICH_TIMEOUT_MS);

            if (!response.ok) {
                logger.error({ statusText: response.statusText }, 'Apollo API Error');
                return {};
            }

            const data = await response.json() as ApolloApiResponse;
            const org = data.organization;

            if (!org) return {};

            return {
                revenue: org.estimated_num_employees ? this.estimateRevenue(org.estimated_num_employees) : undefined,
                headcount: org.estimated_num_employees,
                technologies: org.current_technologies?.map((t) => t.name) || [],
                description: org.short_description || org.description,
                industry: org.industry
            };
        } catch (error) {
            logger.error({ err: error }, 'Erro na integração com Apollo');
            return {};
        }
    }

    private estimateRevenue(employees: number): string {
        if (employees < 10) return '< $1M';
        if (employees < 50) return '$1M - $10M';
        if (employees < 200) return '$10M - $50M';
        if (employees < 1000) return '$50M - $100M';
        return '> $100M';
    }
}

export const apolloService = new ApolloService();
