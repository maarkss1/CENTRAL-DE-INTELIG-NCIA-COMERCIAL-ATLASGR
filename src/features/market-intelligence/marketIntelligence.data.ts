import type {
    MarketIntelligenceManifest,
    MunicipalityRecord,
    SourceEvidence,
    TerritoryRecord,
} from './domain/MarketIntelligence';

const BASE = '/tools/atlas-market-intelligence/data';

async function readJson<T>(path: string): Promise<T> {
    const response = await fetch(path, { headers: { Accept: 'application/json' } });
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

export interface MarketIntelligenceSnapshot {
    manifest: MarketIntelligenceManifest;
    municipalities: MunicipalityRecord[];
    territories: TerritoryRecord[];
    evidences: SourceEvidence[];
}

export async function loadMarketIntelligenceSnapshot(): Promise<MarketIntelligenceSnapshot> {
    const manifest = await loadMarketManifest();
    const [municipalities, territories, evidences] = await Promise.all([
        loadMunicipalities(manifest),
        loadTerritories(manifest),
        loadEvidences(manifest),
    ]);
    return { manifest, municipalities, territories, evidences };
}
