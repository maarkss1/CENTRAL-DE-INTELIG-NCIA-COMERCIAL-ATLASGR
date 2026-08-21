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
    // Quality Gate contra os snapshots nacionais. Quando ele existe, a UI não baixa nem recalcula
    // municipios_scored.json no caminho crítico. Ainda exigimos CIOT em runtime para fail-closed.
    if (publishedTerritories.length) {
        const runtimeManifest = validateRuntimeReadiness(manifest, publishedTerritories, mdfe);
        return {
            manifest: runtimeManifest,
            municipalities: [],
            territories: publishedTerritories,
            evidences,
        };
    }

    // Fallback de compatibilidade: enquanto um snapshot territorial materializado ainda não foi
    // publicado, recompomos somente os componentes matematicamente reproduzíveis no cliente.
    // Este caminho permanece fail-closed e não transforma lacunas de concorrência em zero.
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
