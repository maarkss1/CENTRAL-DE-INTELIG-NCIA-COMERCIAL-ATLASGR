import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MunicipalityRecord } from '../src/features/market-intelligence/domain/MarketIntelligence';
import {
    materializeHubSuitabilityComponents,
    type HubSuitabilityRawRow,
} from '../src/features/market-intelligence/domain/hubSuitability';

const DATA_DIR = resolve(process.cwd(), 'public/tools/atlas-market-intelligence/data');
const municipalities = JSON.parse(
    readFileSync(resolve(DATA_DIR, 'municipios_scored.json'), 'utf8'),
) as MunicipalityRecord[];

if (municipalities.length < 5_000) {
    throw new Error(`Snapshot municipal incompleto para Hub Suitability: ${municipalities.length} linhas.`);
}

const rawRows: HubSuitabilityRawRow[] = municipalities.map((row) => ({
    ibgeCode: row.ibgeCode,
    name: row.name,
    uf: row.uf,
    icpAccounts: row.icp.total,
    rntrcTransporters: row.rntrc.transporters,
    // `activeVehicles` no agregado municipal atual vem do cargoFleet SENATRAN.
    cargoFleet: row.rntrc.activeVehicles,
    regicHierarchyRank: null,
    roadDistanceToReferenceCenterKm: null,
    nearestPublicAirportKm: null,
    evidenceIds: row.evidenceIds.filter((id) => ['cnpj', 'rntrc', 'senatran'].includes(id)),
}));

const components = materializeHubSuitabilityComponents(rawRows);
if (components.length !== municipalities.length) {
    throw new Error(`Hub Suitability perdeu municípios: ${components.length}/${municipalities.length}.`);
}

const withIcp = components.filter((row) => row.components.icpMateriality.value !== null).length;
const withRntrc = components.filter((row) => row.components.rntrcMateriality.value !== null).length;
const withFleet = components.filter((row) => row.components.cargoFleetMateriality.value !== null).length;
const withAllInternal = components.filter((row) =>
    row.components.icpMateriality.value !== null
    && row.components.rntrcMateriality.value !== null
    && row.components.cargoFleetMateriality.value !== null,
).length;

if (withAllInternal < 4_000) {
    throw new Error(`Cobertura interna insuficiente para Hub Suitability: ${withAllInternal} municípios com ICP+RNTRC+frota.`);
}

const prematurelyExternal = components.filter((row) =>
    row.components.urbanCentrality.value !== null
    || row.components.roadAccessibility.value !== null
    || row.components.airportAccessibility.value !== null,
);
if (prematurelyExternal.length) {
    throw new Error(`Componentes externos foram preenchidos sem ingestão oficial: ${prematurelyExternal.length} municípios.`);
}

const prematurelyScored = components.filter((row) => row.overall.value !== null);
if (prematurelyScored.length) {
    throw new Error(`Hub Suitability overall foi calculado sem política explícita em ${prematurelyScored.length} municípios.`);
}

const values = components.flatMap((row) => [
    row.components.icpMateriality.value,
    row.components.rntrcMateriality.value,
    row.components.cargoFleetMateriality.value,
]).filter((value): value is number => value !== null);
if (values.some((value) => value < 0 || value > 100 || !Number.isFinite(value))) {
    throw new Error('Hub Suitability gerou percentil fora de 0–100.');
}

console.log(JSON.stringify({
    methodology: 'hub-suitability-v1-components-only',
    municipalities: components.length,
    coverage: {
        icpMateriality: withIcp,
        rntrcMateriality: withRntrc,
        cargoFleetMateriality: withFleet,
        allInternalComponents: withAllInternal,
        urbanCentrality: 0,
        roadAccessibility: 0,
        airportAccessibility: 0,
    },
    overallPolicy: 'NAO_APROVADA',
    overallScoresPublished: 0,
    decisionUse: 'BLOCKED',
}, null, 2));
