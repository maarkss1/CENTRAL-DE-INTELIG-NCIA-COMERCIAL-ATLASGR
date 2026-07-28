import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrasilApiAdapter } from '../BrasilApiAdapter';

// Setup fetch mock global
const originalFetch = global.fetch;

describe('BrasilApiAdapter', () => {
    let adapter: BrasilApiAdapter;

    beforeEach(() => {
        adapter = new BrasilApiAdapter();
        global.fetch = vi.fn();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('deve retornar empty caso cnpj nao seja informado ou seja invalido', async () => {
        const resultEmpty = await adapter.enrich({});
        expect(resultEmpty).toEqual({});

        const resultInvalid = await adapter.enrich({ cnpj: '0000' });
        expect(resultInvalid).toEqual({});
    });

    it('deve formatar a resposta do CNPJ mapeando corretamente os metadados de confidence', async () => {
        const mockResponse = {
            razao_social: 'EMPRESA BRASIL API LTDA',
            nome_fantasia: 'NOME FANTASIA',
            descricao_situacao_cadastral: 'ATIVA',
            natureza_juridica: 'Sociedade Empresária Limitada',
            capital_social: 100000,
            data_inicio_atividade: '2020-01-01',
            cnae_fiscal: 4930201,
            cnae_fiscal_descricao: 'Transporte rodoviário de carga',
            codigo_porte: 3,
            porte: 'EPP',
            logradouro: 'Rua Teste',
            numero: '123',
            complemento: 'Sala 1',
            bairro: 'Centro',
            municipio: 'São Paulo',
            uf: 'SP',
            cep: '01001-000',
            ddd_telefone_1: '11999999999',
            ddd_telefone_2: '',
            email: 'contato@teste.com'
        };

        adapter.fetchWithRetry = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => mockResponse
        } as any);

        // Usar um CNPJ matematicamente valido pra passar pela validação (12345678000195 tem os digitos verificadores corretos para 123456780001)
        const result = await adapter.enrich({ cnpj: '12.345.678/0001-95' });

        expect(result.company?.legalName).toBe('EMPRESA BRASIL API LTDA');
        expect(result.company?.employeeCountEstimate).toBe(25); // Porte 3 = 25
        expect(result.address?.fullAddress).toBe('Rua Teste, 123, Sala 1, Centro');
        expect(result.contacts?.phones).toContain('(11) 99999-9999');
        expect(result.contacts?.emails).toContain('contato@teste.com');
        expect(result.enrichment?.confidence.company).toBe(100);
    });

    it('deve retornar empty map caso o request falhe', async () => {
        adapter.fetchWithRetry = vi.fn().mockResolvedValue({
            ok: false,
            status: 404
        });
        const result = await adapter.enrich({ cnpj: '12.345.678/0001-95' });
        expect(result).toEqual({});
    });
});
