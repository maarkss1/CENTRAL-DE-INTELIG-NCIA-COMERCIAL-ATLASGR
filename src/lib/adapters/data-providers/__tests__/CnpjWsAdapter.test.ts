import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CnpjWsAdapter } from '../CnpjWsAdapter';

const originalFetch = global.fetch;

describe('CnpjWsAdapter', () => {
    let adapter: CnpjWsAdapter;

    beforeEach(() => {
        adapter = new CnpjWsAdapter();
        global.fetch = vi.fn();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('deve retornar empty caso cnpj nao seja informado', async () => {
        const result = await adapter.enrich({});
        expect(result).toEqual({});
    });

    it('deve preencher o adapter com fallback da API', async () => {
        const mockResponse = {
            razao_social: 'CNPJ WS TESTE LTDA',
            capital_social: '50000.00',
            natureza_juridica: { descricao: 'LTDA' },
            porte: { descricao: 'ME' },
            estabelecimento: {
                nome_fantasia: 'WS FANTASIA',
                situacao_cadastral: 'ATIVA',
                data_inicio_atividade: '2019-05-01',
                atividade_principal: { id: '123', descricao: 'Logistica' },
                tipo_logradouro: 'Avenida',
                logradouro: 'Paulista',
                numero: '1000',
                complemento: '',
                bairro: 'Bela Vista',
                cep: '01310-100',
                cidade: { nome: 'São Paulo' },
                estado: { sigla: 'SP' },
                ddd1: '11',
                telefone1: '988888888',
                email: 'ws@ws.com'
            }
        };

        adapter.fetchWithRetry = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => mockResponse
        } as unknown as Response);

        const result = await adapter.enrich({ cnpj: '12.345.678/0001-95' });

        expect(result.company?.tradeName).toBe('WS FANTASIA');
        expect(result.company?.capitalSocial).toBe(50000);
        expect(result.address?.street).toBe('Avenida Paulista');
        expect(result.contacts?.phones).toContain('(11) 98888-8888');
        expect(result.enrichment?.confidence.company).toBe(95);
    });

    it('deve tratar limites de taxa publicos falhando graciosamente', async () => {
        adapter.fetchWithRetry = vi.fn().mockResolvedValue({
            ok: false,
            status: 500
        });
        const result = await adapter.enrich({ cnpj: '12.345.678/0001-95' });
        expect(result).toEqual({});
    });
});
