import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { companies, territories, company } = vi.hoisted(() => ({
    companies: vi.fn(),
    territories: vi.fn(),
    company: vi.fn(),
}));

vi.mock('../../../src/features/market-intelligence/marketIntelligence.api', () => ({
    marketIntelligenceApi: { companies, territories, company },
}));

import { CompanyExplorer } from '../../../src/features/market-intelligence/components/CompanyExplorer';

const territoryResponse = {
    hierarchy: 'BRASIL_REGIAO_UF_MUNICIPIO',
    data: [{
        municipioIbge: '3543402', municipioNome: 'Ribeirão Preto', uf: 'SP', region: 'Sudeste',
        companies: 1, activeCompanies: 1, icpCompanies: 0, rntrcCompanies: 0,
        rntrcTerritorial: {
            transporters: 3663, etc: 1349, tac: 2313, ctc: 1, etcEquiparada: 1141,
            dataset: 'ANTT RNTRC', competencia: '2026-07', sourceUrl: 'https://dados.antt.gov.br/',
            hash: 'b'.repeat(64), granularity: 'MUNICIPAL', dataOrigin: 'OBSERVED',
        },
    }],
    metadata: {},
};

const companyResponse = {
    data: [{
        cnpj: '12.345.678/0001-95', razaoSocial: 'EMPRESA REAL DE RIBEIRAO LTDA',
        nomeFantasia: 'RIBEIRAO REAL', cnaePrincipal: '4930202', cnaePrincipalDescricao: 'Transporte',
        municipioIbge: '3543402', municipioNome: 'Ribeirão Preto', uf: 'SP', situacaoCadastral: 'ATIVA',
        porte: 'EMPRESA_DE_PEQUENO_PORTE', capitalSocial: 100000, icpTier: null, icpScore: null,
        hasRntrc: null, dataOrigin: 'OBSERVED',
    }],
    pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
    filters: {},
    metadata: {
        competencia: '2026-08', source: 'RECEITA_FEDERAL_CNPJ', sourceVersion: '2026-08',
        datasetHash: 'a'.repeat(64), pipelineVersion: 'test', activatedAt: '2026-08-18T12:00:00Z',
    },
};

describe('CompanyExplorer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        territories.mockResolvedValue(territoryResponse);
        companies.mockResolvedValue(companyResponse);
    });

    afterEach(cleanup);

    it('abre na prova canônica SP/Ribeirão Preto/ATIVA e mostra fonte, competência e empresa', async () => {
        render(<CompanyExplorer />);
        expect(await screen.findByText('EMPRESA REAL DE RIBEIRAO LTDA')).toBeInTheDocument();
        expect(screen.getByText(/Fonte RECEITA_FEDERAL_CNPJ · competência 2026-08/)).toBeInTheDocument();
        expect(screen.getAllByText('NÃO DISPONÍVEL')).toHaveLength(2);
        await waitFor(() => expect(companies).toHaveBeenCalledWith(
            expect.objectContaining({ uf: 'SP', municipioIbge: '3543402', situacaoCadastral: 'ATIVA' }),
            1, 50, expect.any(AbortSignal),
        ));
    });

    it('mantém o estado vazio explícito sem fabricar linhas', async () => {
        companies.mockResolvedValue({
            ...companyResponse, data: [],
            pagination: { ...companyResponse.pagination, total: 0, totalPages: 0 },
        });
        render(<CompanyExplorer />);
        expect(await screen.findByText('Nenhuma empresa encontrada')).toBeInTheDocument();
        expect(screen.getByText('O estado vazio é real para os filtros e a competência publicados.')).toBeInTheDocument();
    });

    it('abre o drill-down e explica o ICP derivado quando ele existe', async () => {
        company.mockResolvedValue({
            cnpj: '12.345.678/0001-95', razaoSocial: 'EMPRESA REAL DE RIBEIRAO LTDA', nomeFantasia: 'RIBEIRAO REAL',
            situacaoCadastral: 'ATIVA', matrizFilial: 'MATRIZ', datas: { situacaoCadastral: null, inicioAtividade: '2020-01-01T00:00:00.000Z' },
            cnae: { principal: { code: '4930202', description: 'Transporte rodoviário de carga' }, secundarios: [] },
            naturezaJuridica: { code: '2062', description: 'Sociedade empresária limitada' }, porte: 'DEMAIS', capitalSocial: 100000,
            address: { tipoLogradouro: 'RUA', logradouro: 'TESTE', numero: '1', complemento: null, bairro: 'CENTRO', cep: '14000000', municipioNome: 'Ribeirão Preto', uf: 'SP' },
            contact: { ddd1: '16', telefone1: '00000000', email: 'publico@example.invalid', status: 'DADO_CADASTRAL_PUBLICO_NAO_VALIDADO' },
            simples: { option: 'NAO', optionDate: null, exclusionDate: null }, mei: { option: 'NAO', optionDate: null, exclusionDate: null },
            icp: { tier: 'ALTO', score: 80, reasons: [{ factor: 'CNAE_PRINCIPAL', impact: 40, message: 'Atividade prioritária' }], taxonomyVersion: 'v1', dataOrigin: 'DERIVED' },
            rntrc: null,
            provenance: { competencia: '2026-08', source: 'RECEITA_FEDERAL_CNPJ', sourceVersion: '2026-08', datasetHash: 'a'.repeat(64), pipelineVersion: 'test', activatedAt: null, dataOrigin: 'OBSERVED', importedAt: '2026-08-18T12:00:00Z' },
        });
        render(<CompanyExplorer />);
        fireEvent.click(await screen.findByRole('button', { name: '12.345.678/0001-95' }));
        expect(await screen.findByRole('dialog')).toHaveTextContent('Atividade prioritária');
        expect(screen.getByRole('dialog')).toHaveTextContent('DERIVED');
        expect(company).toHaveBeenCalledWith('12.345.678/0001-95');
    });

    it('mostra erro observável quando a API falha', async () => {
        companies.mockRejectedValue(new Error('Snapshot empresarial indisponível'));
        render(<CompanyExplorer />);
        expect(await screen.findByRole('alert')).toHaveTextContent('Snapshot empresarial indisponível');
    });

    it('mostra loading enquanto a consulta ainda não respondeu', () => {
        companies.mockReturnValue(new Promise(() => undefined));
        render(<CompanyExplorer />);
        expect(screen.getByText('Carregando snapshot empresarial…')).toBeInTheDocument();
    });
});
