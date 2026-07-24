import { createLogger } from '../logger';

const logger = createLogger('apollo-enrichment');

export interface EnrichedLeadData {
    companyName: string;
    cnpj?: string;
    revenueRange?: string;
    employeeCount?: number;
    decisionMakers: Array<{
        name: string;
        title: string;
        email?: string;
        linkedinUrl?: string;
    }>;
}

export async function enrichCompanyData(companyName: string, domain?: string): Promise<EnrichedLeadData> {
    logger.info(`Iniciando enriquecimento para: ${companyName} (${domain || 'sem domínio'})`);

    const apiKey = process.env.APOLLO_API_KEY;

    if (!apiKey) {
        logger.warn('APOLLO_API_KEY não configurada. Utilizando Mock Inteligente para testes.');
        return {
            companyName,
            revenueRange: 'R$ 10M - R$ 50M',
            employeeCount: 120,
            decisionMakers: [
                {
                    name: 'Carlos Eduardo Silva',
                    title: 'Gerente de Risco e Gerenciamento de Carga',
                    email: `carlos.silva@${domain || 'transportadora.com.br'}`,
                    linkedinUrl: 'https://linkedin.com/in/carlos-silva-log'
                },
                {
                    name: 'Mariana Oliveira',
                    title: 'Diretora de Operações & Logística',
                    email: `mariana.oliveira@${domain || 'transportadora.com.br'}`,
                    linkedinUrl: 'https://linkedin.com/in/mariana-ops'
                }
            ]
        };
    }

    try {
        const response = await fetch('https://api.apollo.io/v1/organizations/enrich', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'Api-Key': apiKey
            },
            body: JSON.stringify({ domain, name: companyName })
        });

        if (!response.ok) {
            throw new Error(`Apollo API respondeu com status ${response.status}`);
        }

        const data = await response.json();
        return {
            companyName: data.organization?.name || companyName,
            revenueRange: data.organization?.estimated_num_employees ? `${data.organization.estimated_num_employees * 50}k USD` : 'N/A',
            employeeCount: data.organization?.estimated_num_employees || 50,
            decisionMakers: []
        };
    } catch (error) {
        logger.error('Erro na chamada da API Apollo:', error);
        throw error;
    }
}
