import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketIntelligenceManifest, TerritoryRecord } from '../../../src/features/market-intelligence/domain/MarketIntelligence';
import { loadMarketIntelligenceSnapshot } from '../../../src/features/market-intelligence/marketIntelligence.data';

const territory = (overrides: Partial<TerritoryRecord> = {}): TerritoryRecord => ({
    id: 't-1',
    baseIbgeCode: '3543402',
    baseCity: 'Ribeirão Preto',
    uf: 'SP',
    radiusKm: 100,
    municipalityCodes: ['3543402'],
    municipalityCount: 1,
    icp: { total: 1000, tierA: 300, tierB: 300, tierC: 400 },
    rntrc: { transporters: 300, etc: 100, tac: 190, ctc: 10, etcEquiparada: 0, activeVehicles: 1000, tractionVehicles: 600, implements: 400 },
    mdfe: { trips: 10000, manifests: null, tonnes: null, tku: null, interstateShare: null },
    competition: { censusStatus: 'NAO_PESQUISADO', verifiedPresences: 0, directRiskManagement: 0, tracking: 0, monitoring: 0, readyResponse: 0, nationalRemoteCoverage: 0 },
    opportunityScore: 80,
    confidence: 'ALTO',
    economics: { tamAccounts: 1000, samAccounts: null, somAccounts: null, potentialMrr: null, breakEvenContracts: null, requiredPipeline: null },
    evidenceIds: ['ibge', 'cnpj', 'rntrc', 'mdfe-ciot', 'sinesp'],
    ...overrides,
});

const manifest = (
    competitionStatus: 'ATUALIZADO' | 'PARCIAL',
    hubStatus: 'ATUALIZADO' | 'NAO_DISPONIVEL',
): MarketIntelligenceManifest => ({
    schemaVersion: '1.0',
    generatedAt: '2026-08-22T13:00:00Z',
    methodologyVersion: 'test-final-gate',
    decisionReady: true,
    decisionBlockers: [],
    datasets: [
        { id: 'competition', label: 'Concorrência', status: competitionStatus },
        { id: 'hub-suitability', label: 'Hub Suitability / eficiência da cidade-base', status: hubStatus },
    ],
    files: { territories: 'territorios.json' },
});

function mockFetch(currentManifest: MarketIntelligenceManifest, currentTerritories: TerritoryRecord[]) {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        let body: unknown;
        if (url.endsWith('/manifest.json')) body = currentManifest;
        else if (url.endsWith('/territorios.json')) body = currentTerritories;
        else if (url.endsWith('/mdfe_origens_municipios.json')) body = [{ ibgeCode: '3543402', trips: 1 }];
        else if (url.endsWith('/mdfe_destinos_municipios.json')) body = [{ ibgeCode: '3543402', trips: 1 }];
        else throw new Error(`URL não mockada: ${url}`);
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
}

afterEach(() => vi.unstubAllGlobals());

describe('Market Intelligence final decision readiness', () => {
    it('bloqueia decisão final quando concorrência, hub e economics estão incompletos', async () => {
        mockFetch(manifest('PARCIAL', 'NAO_DISPONIVEL'), [territory()]);

        const snapshot = await loadMarketIntelligenceSnapshot();
        const blockers = snapshot.manifest.decisionBlockers.join(' ');

        expect(snapshot.territories).toHaveLength(1);
        expect(snapshot.manifest.decisionReady).toBe(false);
        expect(blockers).toContain('concorrência');
        expect(blockers).toContain('Hub Suitability');
        expect(blockers).toContain('SAM');
        expect(blockers).toContain('MRR');
        expect(blockers).toContain('Break-even');
    });

    it('preserva decisionReady somente com censo, hub e economics finais disponíveis', async () => {
        mockFetch(manifest('ATUALIZADO', 'ATUALIZADO'), [territory({
            competition: { censusStatus: 'CENSO_COMPLETO', verifiedPresences: 3, directRiskManagement: 1, tracking: 1, monitoring: 1, readyResponse: 1, nationalRemoteCoverage: 1 },
            economics: { tamAccounts: 1000, samAccounts: 600, somAccounts: 60, potentialMrr: 120000, breakEvenContracts: 8, requiredPipeline: 32 },
        })]);

        const snapshot = await loadMarketIntelligenceSnapshot();

        expect(snapshot.manifest.decisionReady).toBe(true);
        expect(snapshot.manifest.decisionBlockers).toEqual([]);
    });
});
