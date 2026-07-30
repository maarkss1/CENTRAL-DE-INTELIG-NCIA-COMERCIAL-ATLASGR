import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApolloAdapter } from '../ApolloAdapter';
import * as apolloService from '../../../../features/prospecting/services/apollo.service';

vi.mock('../../../../features/prospecting/services/apollo.service', () => ({
    enrichOrganizationByDomain: vi.fn(),
    enrichOrganizationWithContacts: vi.fn()
}));

describe('ApolloAdapter', () => {
    let adapter: ApolloAdapter;

    beforeEach(() => {
        adapter = new ApolloAdapter();
        vi.clearAllMocks();
    });

    it('deve retornar empty se nao informar domain', async () => {
        const result = await adapter.enrich({ cnpj: '123' });
        expect(result).toEqual({});
    });

    it('deve formatar os dados de organizacao e decisores retornando midias e scores', async () => {
        (apolloService.enrichOrganizationByDomain as unknown).mockResolvedValue({
            organization: {
                name: 'Apollo Test',
                estimated_num_employees: 150,
                linkedin_url: 'in/apollo',
                website_url: 'apollo.io'
            }
        });

        (apolloService.enrichOrganizationWithContacts as unknown).mockResolvedValue({
            contacts: [
                { name: 'CTO Test', title: 'CTO', email: 'cto@apollo.io' }
            ]
        });

        const result = await adapter.enrich({ domain: 'https://www.apollo.io/pricing' });

        // Deve limpar a URL passando so o dominio principal
        expect(apolloService.enrichOrganizationByDomain).toHaveBeenCalledWith('apollo.io');

        expect(result.company?.tradeName).toBe('Apollo Test');
        expect(result.company?.employeeCountEstimate).toBe(150);
        expect(result.social?.linkedin).toBe('in/apollo');
        expect(result.contacts?.decisionMakers?.[0].email).toBe('cto@apollo.io');

        expect(result.enrichment?.confidence.social).toBe(95);
    });
});
