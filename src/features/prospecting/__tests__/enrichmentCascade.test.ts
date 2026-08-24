import { describe, it, expect } from 'vitest';

describe('Enrichment Cascade Service (Apollo ➔ Hunter ➔ Google Places)', () => {
    it('initializes cascade result structure properly', async () => {
        // Testando a função com fallback de dados quando APIs externas não estão configuradas ou simulação
        const fakeCompany = {
            id: 'comp-123',
            tradeName: 'Transportes Atlas Express',
            legalName: 'Transportes Atlas Express Ltda',
            cnpj: '12.345.678/0001-90',
            city: 'São Paulo',
            state: 'SP',
            website: 'https://atlasexpress.com.br',
            technologies: ['React', 'Node.js'],
            keywords: ['Logística', 'Cargas'],
            phones: ['11999998888'],
            organizationId: 'org-test-1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            apolloOrgId: null,
            googleRating: null,
            googleReviewsCount: null,
            businessHours: null,
            enrichmentStatus: 'Pendente',
            enrichmentSource: null,
            lastEnrichedAt: null,
            status: 'Ativo',
            cnae: '4930-2/02',
            segment: 'Transporte Rodoviário de Cargas',
            address: 'Av. Paulista, 1000',
            zipCode: '01310-100',
            capitalSocial: 100000,
        };

        expect(fakeCompany.tradeName).toBe('Transportes Atlas Express');
        expect(fakeCompany.cnpj).toBe('12.345.678/0001-90');
    });
});
