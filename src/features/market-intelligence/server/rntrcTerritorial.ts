import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '../../../lib/logger.js';

export type RntrcTerritorialRow = {
    ibgeCode: string;
    name: string;
    uf: string;
    region: string;
    transporters: number;
    etc: number;
    tac: number;
    ctc: number;
    etcEquiparada: number;
};

type RntrcMetadata = {
    dataset: string;
    resource?: {
        id?: string;
        url?: string;
        competence?: string;
        last_modified?: string;
    };
    outputSha256?: string;
    sourcePage?: string;
};

export type RntrcTerritorialSnapshot = {
    rows: RntrcTerritorialRow[];
    byIbge: Map<string, RntrcTerritorialRow>;
    metadata: {
        dataset: string;
        competencia: string | null;
        sourceUrl: string | null;
        hash: string | null;
        granularity: 'MUNICIPAL';
        dataOrigin: 'OBSERVED';
    };
};

let cached: RntrcTerritorialSnapshot | null = null;

export function rntrcTerritorialSnapshot(): RntrcTerritorialSnapshot {
    if (cached) return cached;
    const base = resolve(process.cwd(), 'public', 'tools', 'atlas-market-intelligence', 'data');
    try {
        const rows = JSON.parse(readFileSync(resolve(base, 'rntrc_municipios.json'), 'utf8')) as RntrcTerritorialRow[];
        const metadata = JSON.parse(readFileSync(resolve(base, 'rntrc_municipios.metadata.json'), 'utf8')) as RntrcMetadata;
        cached = {
            rows,
            byIbge: new Map(rows.map((row) => [row.ibgeCode, row])),
            metadata: {
                dataset: metadata.dataset,
                competencia: metadata.resource?.competence ?? null,
                sourceUrl: metadata.sourcePage ?? metadata.resource?.url ?? null,
                hash: metadata.outputSha256 ?? null,
                granularity: 'MUNICIPAL',
                dataOrigin: 'OBSERVED',
            },
        };
        return cached;
    } catch (error) {
        logger.warn({ event: 'rntrc_territorial_unavailable', error }, 'RNTRC territorial snapshot unavailable');
        cached = {
            rows: [],
            byIbge: new Map(),
            metadata: {
                dataset: 'ANTT RNTRC', competencia: null, sourceUrl: null, hash: null,
                granularity: 'MUNICIPAL', dataOrigin: 'OBSERVED',
            },
        };
        return cached;
    }
}
