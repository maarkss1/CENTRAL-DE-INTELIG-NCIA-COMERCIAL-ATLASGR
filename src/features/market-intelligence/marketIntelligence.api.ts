import { api } from '../../lib/api';

export interface MarketCompanySummary {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    cnaePrincipal: string | null;
    cnaePrincipalDescricao: string | null;
    municipioIbge: string | null;
    municipioNome: string | null;
    uf: string | null;
    situacaoCadastral: string | null;
    porte: string | null;
    capitalSocial: number | null;
    icpTier: string | null;
    icpScore: number | null;
    hasRntrc: boolean | null;
    dataOrigin: string;
}

export interface MarketDatasetMetadata {
    competencia: string;
    source: string;
    sourceVersion: string | null;
    datasetHash: string;
    pipelineVersion: string;
    activatedAt: string | null;
}

export interface MarketCompanyListResult {
    data: MarketCompanySummary[];
    pagination: {
        page: number; pageSize: number; total: number; totalPages: number;
        hasNext: boolean; hasPrevious: boolean;
    };
    filters: Record<string, unknown>;
    metadata: MarketDatasetMetadata;
}

export interface MarketTerritory {
    municipioIbge: string;
    municipioNome: string;
    uf: string;
    region: string | null;
    companies: number;
    activeCompanies: number;
    icpCompanies: number;
    rntrcCompanies: number;
    rntrcTerritorial: {
        transporters: number;
        etc: number;
        tac: number;
        ctc: number;
        etcEquiparada: number;
        dataset: string;
        competencia: string | null;
        sourceUrl: string | null;
        hash: string | null;
        granularity: 'MUNICIPAL';
        dataOrigin: 'OBSERVED';
    } | null;
}

export interface MarketSource {
    id: string;
    dataset: string;
    name: string;
    provider: string;
    source: string;
    sourceVersion: string | null;
    sourceUrl: string | null;
    competencia: string;
    status: string;
    hash: string;
    pipelineVersion: string;
    granularity: string;
    records: number;
    recordsRejected: number;
    recordsActive: number;
    active: boolean;
    startedAt: string | null;
    finishedAt: string | null;
    activatedAt: string | null;
}

export interface MarketCompanyDetail {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    situacaoCadastral: string | null;
    matrizFilial: string | null;
    datas: { situacaoCadastral: string | null; inicioAtividade: string | null };
    cnae: {
        principal: { code: string | null; description: string | null };
        secundarios: Array<{ code: string; description: string | null }>;
    };
    naturezaJuridica: { code: string | null; description: string | null };
    porte: string | null;
    capitalSocial: number | null;
    address: Record<string, string | null>;
    contact: Record<string, string | null> & { status: string };
    simples: { option: string | null; optionDate: string | null; exclusionDate: string | null };
    mei: { option: string | null; optionDate: string | null; exclusionDate: string | null };
    icp: {
        tier: string;
        score: number | null;
        reasons: Array<{ factor?: string; value?: string; impact?: number; message?: string }>;
        taxonomyVersion: string | null;
        dataOrigin: 'DERIVED';
    } | null;
    rntrc: Record<string, unknown> | null;
    provenance: MarketDatasetMetadata & { dataOrigin: string; importedAt: string | null };
}

export interface CompanyFilters {
    uf?: string;
    municipioIbge?: string;
    cnpj?: string;
    razaoSocial?: string;
    nomeFantasia?: string;
    cnae?: string;
    situacaoCadastral?: string;
    icpMinimo?: string;
    matrizFilial?: string;
    rntrc?: string;
    simples?: string;
    mei?: string;
}

function queryString(values: Record<string, string | number | undefined>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined && value !== '') params.set(key, String(value));
    }
    return params.toString();
}

const BASE = '/api/market-intelligence';

export const marketIntelligenceApi = {
    companies: (filters: CompanyFilters, page: number, pageSize = 50, signal?: AbortSignal) =>
        api.get<MarketCompanyListResult>(`${BASE}/companies?${queryString({ ...filters, page, pageSize })}`, { signal }),
    company: (cnpj: string, signal?: AbortSignal) =>
        api.get<MarketCompanyDetail>(`${BASE}/companies/${encodeURIComponent(cnpj)}`, { signal }),
    territories: (uf?: string, signal?: AbortSignal) =>
        api.get<{ hierarchy: string; data: MarketTerritory[]; metadata: MarketDatasetMetadata }>(
            `${BASE}/territories?${queryString({ uf })}`, { signal },
        ),
    sources: (signal?: AbortSignal) =>
        api.get<{ sources: MarketSource[] }>(`${BASE}/sources`, { signal }),
};
