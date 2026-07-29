import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MergeEngineService } from '../MergeEngineService';

// Mock dos adapters para não fazer requisições reais
vi.mock('../../../../lib/adapters/data-providers/BrasilApiAdapter', () => {
    return {
        BrasilApiAdapter: class {
            providerName = 'BrasilAPI';
            enrich = vi.fn().mockResolvedValue({
                company: { tradeName: 'Empresa Teste BrasilAPI', cnpj: '12.345.678/0001-90' },
                address: { city: 'São Paulo' },
                enrichment: { confidence: { company: 100, address: 90, contacts: 0, social: 0 }, sources: [] }
            });
        }
    }
});

vi.mock('../../../../lib/adapters/data-providers/CnpjWsAdapter', () => {
    return {
        CnpjWsAdapter: class {
            providerName = 'CNPJ.ws';
            enrich = vi.fn().mockResolvedValue({
                company: { tradeName: 'Empresa Teste CNPJ.ws', size: 'ME' },
                enrichment: { confidence: { company: 95, address: 0, contacts: 0, social: 0 }, sources: [] }
            });
        }
    }
});

vi.mock('../../../../lib/adapters/data-providers/GooglePlacesAdapter', () => {
    return {
        GooglePlacesAdapter: class {
            providerName = 'Google Places';
            enrich = vi.fn().mockResolvedValue({
                contacts: { phones: ['11999999999'] },
                enrichment: { confidence: { company: 0, address: 0, contacts: 90, social: 0 }, sources: [] }
            });
        }
    }
});

vi.mock('../../../../lib/adapters/data-providers/ApolloAdapter', () => {
    return {
        ApolloAdapter: class {
            providerName = 'Apollo.io';
            enrich = vi.fn().mockResolvedValue({
                social: { linkedin: 'https://linkedin.com/company/teste' },
                contacts: { decisionMakers: [{ name: 'CEO Teste', email: 'ceo@teste.com' }] },
                enrichment: { confidence: { company: 0, address: 0, contacts: 85, social: 95 }, sources: [] }
            });
        }
    }
});

describe('MergeEngineService', () => {
    let service: MergeEngineService;

    beforeEach(() => {
        service = new MergeEngineService();
    });

    it('deve agregar resultados sem sobrescrever dados mais confiáveis', async () => {
        const result = await service.enrich({ cnpj: '12345678000190', domain: 'teste.com' });

        // Empresa deve vir da BrasilAPI (100) e não do CNPJ.ws (95)
        expect(result.company.tradeName).toBe('Empresa Teste BrasilAPI');
        expect(result.company.cnpj).toBe('12.345.678/0001-90');

        // Telefones devem vir do Google Places
        expect(result.contacts.phones).toContain('11999999999');

        // Decisores devem vir da Apollo
        expect(result.contacts.decisionMakers).toHaveLength(1);
        expect(result.contacts.decisionMakers[0].name).toBe('CEO Teste');

        // Social deve vir da Apollo
        expect(result.social.linkedin).toBe('https://linkedin.com/company/teste');

        // A execução deve ter populado executionTime e timestamp
        expect(result.enrichment.executionTime).toBeGreaterThanOrEqual(0);
        expect(result.enrichment.timestamp).toBeDefined();
    });
});
