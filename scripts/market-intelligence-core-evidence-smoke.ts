import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MunicipalityRecord } from '../src/features/market-intelligence/domain/MarketIntelligence';
import {
    buildCoreTerritories,
    CORE_DECISION_MAX_RADIUS_KM,
    hydrateCoreEvidence,
    type MdfeMunicipalRow,
} from '../src/features/market-intelligence/domain/coreEvidence';

const DATA_DIR = resolve(process.cwd(), 'public/tools/atlas-market-intelligence/data');
const WRITE_TERRITORIES = process.argv.includes('--write');
const PUBLISHED_TERRITORY_LIMIT = 10;

function readJson<T>(filename: string): T {
    return JSON.parse(readFileSync(resolve(DATA_DIR, filename), 'utf8')) as T;
}

const municipalities = readJson<MunicipalityRecord[]>('municipios_scored.json');
const origins = readJson<MdfeMunicipalRow[]>('mdfe_origens_municipios.json');
const destinations = readJson<MdfeMunicipalRow[]>('mdfe_destinos_municipios.json');

if (municipalities.length < 5_000) {
    throw new Error(`Snapshot municipal incompleto: ${municipalities.length} linhas.`);
}
if (!origins.length || !destinations.length) {
    throw new Error('Snapshot CIOT origem/destino não foi publicado ou está vazio.');
}

const hydrated = hydrateCoreEvidence(municipalities, origins, destinations);
const scored = hydrated.filter((row) => row.scores.confidenceAdjustedOpportunity.value !== null);
const territories = buildCoreTerritories(hydrated);

if (scored.length < 1_000) {
    throw new Error(`Cobertura Core Evidence insuficiente: somente ${scored.length} municípios pontuados.`);
}
if (territories.length < 5) {
    throw new Error(`Ranking territorial insuficiente: somente ${territories.length} candidatos.`);
}
if (territories.some((territory) => territory.opportunityScore === null)) {
    throw new Error('Ranking territorial contém candidato sem Opportunity Score.');
}
if (territories.some((territory) => territory.radiusKm > CORE_DECISION_MAX_RADIUS_KM)) {
    throw new Error(`Ranking automático excedeu o raio decisório de ${CORE_DECISION_MAX_RADIUS_KM} km.`);
}
for (let index = 1; index < territories.length; index += 1) {
    if ((territories[index - 1].opportunityScore ?? 0) < (territories[index].opportunityScore ?? 0)) {
        throw new Error('Ranking territorial não está ordenado por Opportunity Score decrescente.');
    }
}

const publishedTerritories = territories.slice(0, PUBLISHED_TERRITORY_LIMIT);
if (WRITE_TERRITORIES) {
    const output = resolve(DATA_DIR, 'territorios.json');
    writeFileSync(output, `${JSON.stringify(publishedTerritories)}\n`, 'utf8');
    console.log(`territorios.json materializado com ${publishedTerritories.length} candidatos em ${output}`);
}

const top5 = publishedTerritories.slice(0, 5).map((territory, index) => ({
    rank: index + 1,
    baseCity: territory.baseCity,
    uf: territory.uf,
    radiusKm: territory.radiusKm,
    municipalities: territory.municipalityCount,
    opportunityScore: Number(territory.opportunityScore?.toFixed(2)),
    confidence: territory.confidence,
    icpAccounts: territory.icp.total,
    ciotTrips: territory.mdfe.trips,
}));

console.log(JSON.stringify({
    methodology: 'national-v1.1-core-evidence',
    municipalities: municipalities.length,
    scoredMunicipalities: scored.length,
    ciotOrigins: origins.length,
    ciotDestinations: destinations.length,
    territoryCandidates: territories.length,
    publishedTerritories: publishedTerritories.length,
    decisionMaxRadiusKm: CORE_DECISION_MAX_RADIUS_KM,
    top5,
}, null, 2));
