import type {
    MarketIntelligenceManifest,
    MunicipalityRecord,
    SourceEvidence,
    TerritoryRecord,
} from './domain/MarketIntelligence';
import {
    buildCoreTerritories,
    hydrateCoreEvidence,
    type MdfeMunicipalRow,
} from './domain/coreEvidence';

const BASE = '/tools/atlas-market-intelligence/data';
const MIN_NATIONAL_SCORED_MUNICIPALITIES = 1_000;
const FINALIST_COUNT = 5;

async function readJson<T>(path: string): Promise<T> {
    const response = await fetch(path, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Falha ao carregar ${path}: HTTP ${response.status}`);
    return response.json() as Promise<T>;
}

async function readOptionalJson<T>(path: string, fallback: T): Promise<T> {
    const response = await fetch(path, { headers: { Accept: 'application/json' } });
    if (response.status === 404) return fallback;
    if (!response.ok) throw new Error(`Falha ao carregar ${path}: HTTP ${response.status}`);
    return response.json() as Promise<T>;
}

export async function loadMarketManifest(): Promise<MarketIntelligenceManifest> {
    return readJson<MarketIntelligenceManifest>(`${BASE}/manifest.json`);
}

export async function loadMunicipalities(manifest: MarketIntelligenceManifest): Promise<MunicipalityRecord[]> {
    if (!manifest.files.municipalities) return [];
    return readJson<MunicipalityRecord[]>(`${BASE}/${manifest.files.municipalities}`);
}

export async function loadTerritories(manifest: MarketIntelligenceManifest): Promise<TerritoryRecord[]> {
    if (!manifest.files.territories) return [];
    return readJson<TerritoryRecord[]>(`${BASE}/${manifest.files.territories}`);
}

export async function loadEvidences(manifest: MarketIntelligenceManifest): Promise<SourceEvidence[]> {
    if (!manifest.files.evidences) return [];
    return readJson<SourceEvidence[]>(`${BASE}/${manifest.files.evidences}`);
}

async function loadMdfeMunicipalFlow(): Promise<{ origins: MdfeMunicipalRow[]; destinations: MdfeMunicipalRow[] }> {
    const [origins, destinations] = await Promise.all([
        readOptionalJson<MdfeMunicipalRow[]>(`${BASE}/mdfe_origens_municipios.json`, []),
        readOptionalJson<MdfeMunicipalRow[]>(`${BASE}/mdfe_destinos_municipios.json`, []),
    ]);
    return { origins, destinations };
}

export interface MarketIntelligenceSnapshot {
    manifest: MarketIntelligenceManifest;
    municipalities: MunicipalityRecord[];
    territories: TerritoryRecord[];
    evidences: SourceEvidence[];
}

/**
 * `decisionReady` é o gate FINAL da ordem de contratação, não o gate do ranking exploratório.
 *
 * Core Evidence pode ordenar territórios para investigação com ICP/RNTRC/fluxo/Need. A Board
 * "Onde contratar agora?" só abre quando concorrência, White Space, qualidade da cidade-hub e
 * unit economics mínimos forem auditáveis. A validação é repetida no runtime para impedir que
 * um manifest antigo/errado deixe a interface artificialmente verde.
 */
function validateRuntimeReadiness(
    manifest: MarketIntelligenceManifest,
    territories: TerritoryRecord[],
    mdfe: { origins: MdfeMunicipalRow[]; destinations: MdfeMunicipalRow[] },
    scoredMunicipalities?: number,
): MarketIntelligenceManifest {
    const runtimeBlockers: string[] = [];

    if (!mdfe.origins.length || !mdfe.destinations.length) {
        runtimeBlockers.push('Snapshot CIOT origem/destino obrigatório não está disponível em runtime.');
    }
    if (scoredMunicipalities !== undefined && scoredMunicipalities < MIN_NATIONAL_SCORED_MUNICIPALITIES) {
        runtimeBlockers.push(
            `Core Evidence nacional insuficiente em runtime: ${scoredMunicipalities} municípios pontuados; mínimo operacional ${MIN_NATIONAL_SCORED_MUNICIPALITIES}.`,
        );
    }
    if (!territories.length) {
        runtimeBlockers.push('Nenhum território elegível pôde ser construído a partir dos snapshots publicados.');
    }

    const competitionDataset = manifest.datasets.find((dataset) => dataset.id === 'competition');
    if (!competitionDataset || competitionDataset.status !== 'ATUALIZADO') {
        runtimeBlockers.push('Censo nacional de concorrência ainda não está completo; White Space competitivo final permanece bloqueado.');
    }

    // O contrato DatasetHealth legado ainda não possui um id próprio para Hub Suitability.
    // Enquanto a migração de schema não ocorre, o gate reconhece a camada pela label publicada
    // no manifest. Isso mantém a decisão fechada sem falsificar que distância Haversine já mede
    // conectividade/tempo de viagem real.
    const hubDataset = manifest.datasets.find((dataset) => dataset.label.startsWith('Hub Suitability'));
    if (!hubDataset || hubDataset.status !== 'ATUALIZADO') {
        runtimeBlockers.push('Hub Suitability ainda não foi validado com conectividade, materialidade da base e eficiência operacional suficientes.');
    }

    const finalists = territories.slice(0, FINALIST_COUNT);
    if (finalists.length && finalists.some((territory) => territory.competition.censusStatus !== 'CENSO_COMPLETO')) {
        runtimeBlockers.push(`Os ${Math.min(FINALIST_COUNT, finalists.length)} territórios finalistas ainda não possuem CENSO_COMPLETO comparável.`);
    }
    if (finalists.length && finalists.some((territory) => territory.economics.samAccounts === null)) {
        runtimeBlockers.push('SAM dos territórios finalistas ainda não está calculado com regra comercial aprovada.');
    }
    if (finalists.length && finalists.some((territory) => territory.economics.potentialMrr === null)) {
        runtimeBlockers.push('MRR potencial dos territórios finalistas depende de PREMISSAS_EDITÁVEIS Atlas ainda não aprovadas.');
    }
    if (finalists.length && finalists.some((territory) => territory.economics.breakEvenContracts === null)) {
        runtimeBlockers.push('Break-even por território ainda não está autorizado por premissas econômicas Atlas validadas.');
    }

    if (!runtimeBlockers.length) return manifest;
    return {
        ...manifest,
        decisionReady: false,
        decisionBlockers: [...new Set([...manifest.decisionBlockers, ...runtimeBlockers])],
    };
}

export async function loadMarketIntelligenceSnapshot(): Promise<MarketIntelligenceSnapshot> {
    const manifest = await loadMarketManifest();
    const [publishedTerritories, evidences, mdfe] = await Promise.all([
        loadTerritories(manifest),
        loadEvidences(manifest),
        loadMdfeMunicipalFlow(),
    ]);

    // Caminho rápido de produção: territorios.json é uma visão materializada e validada pelo
    // Quality Gate contra os snapshots nacionais. Quando existe, a Board não baixa nem recalcula
    // municipios_scored.json no caminho crítico. O gate final ainda é revalidado em runtime.
    if (publishedTerritories.length) {
        const runtimeManifest = validateRuntimeReadiness(manifest, publishedTerritories, mdfe);
        return {
            manifest: runtimeManifest,
            municipalities: [],
            territories: publishedTerritories,
            evidences,
        };
    }

    // Fallback: recompõe apenas os componentes matematicamente reproduzíveis no cliente.
    // Continua fail-closed e jamais converte lacuna competitiva em concorrência zero.
    const municipalitiesBase = await loadMunicipalities(manifest);
    const municipalities = mdfe.origins.length || mdfe.destinations.length
        ? hydrateCoreEvidence(municipalitiesBase, mdfe.origins, mdfe.destinations)
        : municipalitiesBase;
    const territories = buildCoreTerritories(municipalities);
    const scoredMunicipalities = municipalities.filter(
        (row) => row.scores.confidenceAdjustedOpportunity.value !== null,
    ).length;
    const runtimeManifest = validateRuntimeReadiness(
        manifest,
        territories,
        mdfe,
        scoredMunicipalities,
    );

    return { manifest: runtimeManifest, municipalities, territories, evidences };
}
