import fetch from 'node-fetch';

export interface ApolloEnrichmentData {
    revenue?: string;
    headcount?: number;
    technologies?: string[];
    description?: string;
    industry?: string;
}

export class ApolloService {
    private apiKey: string;
    private baseUrl = 'https://api.apollo.io/v1';

    constructor() {
        this.apiKey = process.env.APOLLO_API_KEY || '';
    }

    /**
     * Busca dados da empresa no Apollo.io
     * Em ambiente de desenvolvimento sem API KEY válida, retorna dados Mockados para evitar custos.
     */
    async enrichCompany(domain: string, companyName: string): Promise<ApolloEnrichmentData> {
        if (!this.apiKey || process.env.NODE_ENV !== 'production') {
            console.log(`[Apollo Mock] Enriquecendo ${companyName} (${domain})...`);
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
            console.log(`[Apollo Real] Buscando dados de ${domain}...`);
            const response = await fetch(`${this.baseUrl}/organizations/enrich?domain=${domain}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'x-api-key': this.apiKey
                }
            });

            if (!response.ok) {
                console.error(`Apollo API Error: ${response.statusText}`);
                return {};
            }

            const data = await response.json() as any;
            const org = data.organization;

            if (!org) return {};

            return {
                revenue: org.estimated_num_employees ? this.estimateRevenue(org.estimated_num_employees) : undefined,
                headcount: org.estimated_num_employees,
                technologies: org.current_technologies?.map((t: any) => t.name) || [],
                description: org.short_description || org.description,
                industry: org.industry
            };
        } catch (error) {
            console.error('Erro na integração com Apollo:', error);
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
