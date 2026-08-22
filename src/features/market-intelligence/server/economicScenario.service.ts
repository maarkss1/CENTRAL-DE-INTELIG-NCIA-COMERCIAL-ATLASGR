import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { withRlsContext } from '../../../lib/prisma.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import { CommercialIntelligenceUseCases, currentPeriod } from '../../commercial-intelligence/application/CommercialIntelligenceUseCases.js';
import { PrismaCommercialIntelligenceRepository } from '../../commercial-intelligence/infra/PrismaCommercialIntelligenceRepository.js';
import type { TerritoryRecord, MarketIntelligenceManifest } from '../domain/MarketIntelligence.js';
import { calibrateSellerEconomicsFromHistory } from '../domain/crmEconomicCalibration.js';
import {
    CRM_CALIBRATION_VERSION,
    ECONOMIC_MODEL_VERSION,
    ECONOMIC_SCENARIO_AUDIT_VERSION,
    type EconomicScenarioSnapshot,
    type SavedEconomicScenario,
    type SavedEconomicScenarioSummary,
} from '../domain/economicScenarioAudit.js';
import { DEFAULT_RAMP, type SellerModelAssumptions } from '../domain/sellerEconomics.js';
import { assessTerritoryEconomics } from '../domain/territoryEconomics.js';
import type { EconomicScenarioListQuery, EconomicScenarioSavePayload } from './economicScenario.schemas.js';

const DATA_DIR = path.resolve(process.cwd(), 'public/tools/atlas-market-intelligence/data');
const TERRITORIES_FILE = path.join(DATA_DIR, 'territorios.json');
const MANIFEST_FILE = path.join(DATA_DIR, 'manifest.json');
const commercialIntelligenceUseCases = new CommercialIntelligenceUseCases(new PrismaCommercialIntelligenceRepository());

interface CanonicalEconomicEvidence {
    territories: Map<string, TerritoryRecord>;
    methodologyVersion: string;
}

interface ScenarioRow {
    id: string;
    organizationId: string;
    createdBy: string | null;
    label: string;
    territoryId: string;
    baseCity: string;
    uf: string;
    radiusKm: number;
    commercialScenario: SavedEconomicScenarioSummary['commercialScenario'];
    recommendation: SavedEconomicScenarioSummary['recommendation'];
    auditVersion: string;
    methodologyVersion: string;
    economicModelVersion: string;
    calibrationVersion: string | null;
    calibrationApplied: boolean;
    calibrationQuality: SavedEconomicScenarioSummary['calibrationQuality'];
    tamAccounts: number | null;
    samAccounts: number | null;
    monthlyFixedCost: number;
    paybackMonth: number | null;
    roi12Pct: number | null;
    roi24Pct: number | null;
    snapshotHash: string;
    snapshot?: EconomicScenarioSnapshot;
    createdAt: Date | string;
}

let canonicalEvidencePromise: Promise<CanonicalEconomicEvidence> | null = null;

function stableStringify(value: unknown): string {
    if (value === undefined) return 'null';
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
}

function hashSnapshot(snapshot: EconomicScenarioSnapshot): string {
    return createHash('sha256').update(stableStringify(snapshot)).digest('hex');
}

async function canonicalEvidence(): Promise<CanonicalEconomicEvidence> {
    if (!canonicalEvidencePromise) {
        canonicalEvidencePromise = Promise.all([
            readFile(TERRITORIES_FILE, 'utf8'),
            readFile(MANIFEST_FILE, 'utf8'),
        ]).then(([territoriesRaw, manifestRaw]) => {
            const territories = JSON.parse(territoriesRaw) as TerritoryRecord[];
            const manifest = JSON.parse(manifestRaw) as MarketIntelligenceManifest;
            if (!Array.isArray(territories) || territories.length === 0) {
                throw new AppError('Ranking territorial materializado indisponível para auditoria econômica.', 503);
            }
            if (!manifest.methodologyVersion) {
                throw new AppError('Manifest de Market Intelligence sem methodologyVersion.', 503);
            }
            return {
                territories: new Map(territories.map((territory) => [territory.id, territory])),
                methodologyVersion: manifest.methodologyVersion,
            };
        }).catch((error) => {
            canonicalEvidencePromise = null;
            throw error;
        });
    }
    return canonicalEvidencePromise;
}

async function resolveEffectiveCalibration(
    organizationId: string,
    input: EconomicScenarioSavePayload,
): Promise<EconomicScenarioSavePayload['calibration']> {
    if (!input.calibration.applied) return { applied: false, snapshot: null };

    // A prova enviada pelo navegador é apenas contexto de UX. Para um snapshot auditável, a fonte
    // de verdade é recalculada aqui usando o mesmo use case que serve /commercial-intelligence/trends.
    const trends = await commercialIntelligenceUseCases.historicalTrends(
        organizationId,
        { month: currentPeriod() },
    );
    const calibration = calibrateSellerEconomicsFromHistory(trends.points);
    if (!calibration.eligible) {
        throw new AppError('A calibração CRM atual não possui amostra elegível para selar este snapshot.', 400);
    }

    const expected = calibration.recommended;
    const pairs: Array<[string, number, number | null]> = [
        ['Ticket MRR', input.revenue.averageMrrTicket, expected.averageMrrTicket],
        ['Win Rate', input.revenue.winRatePct, expected.winRatePct],
        ['Sales Cycle', input.revenue.salesCycleDays, expected.salesCycleDays],
    ];
    for (const [label, actual, calibrated] of pairs) {
        if (calibrated === null || Math.abs(actual - calibrated) > 0.011) {
            throw new AppError(`${label} diverge da calibração CRM recalculada no servidor. Reaplique os dados do CRM antes de salvar.`, 400);
        }
    }
    return { applied: true, snapshot: calibration };
}

function canonicalTerritory(territory: TerritoryRecord) {
    return {
        id: territory.id,
        baseIbgeCode: territory.baseIbgeCode,
        baseCity: territory.baseCity,
        uf: territory.uf,
        radiusKm: territory.radiusKm,
        municipalityCount: territory.municipalityCount,
        opportunityScore: territory.opportunityScore,
        confidence: territory.confidence,
        icp: territory.icp,
        evidenceIds: territory.evidenceIds,
    };
}

function toSummary(row: ScenarioRow): SavedEconomicScenarioSummary {
    return {
        id: row.id,
        label: row.label,
        territoryId: row.territoryId,
        baseCity: row.baseCity,
        uf: row.uf,
        radiusKm: row.radiusKm as SavedEconomicScenarioSummary['radiusKm'],
        commercialScenario: row.commercialScenario,
        recommendation: row.recommendation,
        auditVersion: row.auditVersion,
        methodologyVersion: row.methodologyVersion,
        economicModelVersion: row.economicModelVersion,
        calibrationVersion: row.calibrationVersion,
        calibrationApplied: row.calibrationApplied,
        calibrationQuality: row.calibrationQuality,
        tamAccounts: row.tamAccounts,
        samAccounts: row.samAccounts,
        monthlyFixedCost: row.monthlyFixedCost,
        paybackMonth: row.paybackMonth,
        roi12Pct: row.roi12Pct,
        roi24Pct: row.roi24Pct,
        snapshotHash: row.snapshotHash,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
        createdBy: row.createdBy,
    };
}

function toDetail(row: ScenarioRow): SavedEconomicScenario {
    if (!row.snapshot) throw new AppError('Snapshot econômico persistido está incompleto.', 500);
    return { ...toSummary(row), snapshot: row.snapshot };
}

export const economicScenarioService = {
    async save(organizationId: string, createdBy: string, input: EconomicScenarioSavePayload): Promise<SavedEconomicScenario> {
        const [evidence, effectiveCalibration] = await Promise.all([
            canonicalEvidence(),
            resolveEffectiveCalibration(organizationId, input),
        ]);
        const territory = evidence.territories.get(input.territoryId);
        if (!territory) throw new AppError('Território não pertence ao ranking canônico publicado.', 400);

        const model: SellerModelAssumptions = {
            costs: input.costs,
            revenue: { ...input.revenue, samAccounts: null },
            ramp: DEFAULT_RAMP,
            upfrontInvestment: input.upfrontInvestment,
        };
        const assessment = assessTerritoryEconomics(
            territory,
            { serviceableSharePct: input.serviceableSharePct },
            model,
            input.policy,
            input.scenario,
        );
        const snapshot: EconomicScenarioSnapshot = {
            auditVersion: ECONOMIC_SCENARIO_AUDIT_VERSION,
            methodologyVersion: evidence.methodologyVersion,
            economicModelVersion: ECONOMIC_MODEL_VERSION,
            calibrationVersion: effectiveCalibration.snapshot ? CRM_CALIBRATION_VERSION : null,
            territory: canonicalTerritory(territory),
            input: {
                serviceableSharePct: input.serviceableSharePct,
                costs: input.costs,
                revenue: input.revenue,
                upfrontInvestment: input.upfrontInvestment,
                policy: input.policy,
                scenario: input.scenario,
                calibration: effectiveCalibration,
            },
            assessment,
        };
        const snapshotHash = hashSnapshot(snapshot);
        const id = randomUUID();
        const label = input.label?.trim() || `${territory.baseCity}/${territory.uf} · ${input.scenario}`;
        const calibrationQuality = effectiveCalibration.snapshot?.quality ?? null;
        const snapshotJson = JSON.stringify(snapshot);

        const row = await withRlsContext(async (tx) => {
            const inserted = await tx.$queryRaw<ScenarioRow[]>(Prisma.sql`
                INSERT INTO "MarketIntelligenceEconomicScenario" (
                    "id","organizationId","createdBy","label","territoryId","baseCity","uf","radiusKm",
                    "commercialScenario","recommendation","auditVersion","methodologyVersion","economicModelVersion",
                    "calibrationVersion","calibrationApplied","calibrationQuality","tamAccounts","samAccounts",
                    "monthlyFixedCost","paybackMonth","roi12Pct","roi24Pct","snapshotHash","snapshot"
                ) VALUES (
                    ${id},${organizationId},${createdBy},${label},${territory.id},${territory.baseCity},${territory.uf},${territory.radiusKm},
                    ${input.scenario},${assessment.recommendation},${ECONOMIC_SCENARIO_AUDIT_VERSION},${evidence.methodologyVersion},${ECONOMIC_MODEL_VERSION},
                    ${effectiveCalibration.snapshot ? CRM_CALIBRATION_VERSION : null},${effectiveCalibration.applied},${calibrationQuality},
                    ${assessment.tamAccounts},${assessment.samAccounts},${assessment.economics.monthlyFixedCost},${assessment.economics.paybackMonth},
                    ${assessment.economics.roi12Pct},${assessment.economics.roi24Pct},${snapshotHash},${snapshotJson}::jsonb
                )
                ON CONFLICT ("organizationId","snapshotHash") DO NOTHING
                RETURNING *
            `);
            if (inserted[0]) return inserted[0];
            const existing = await tx.$queryRaw<ScenarioRow[]>(Prisma.sql`
                SELECT * FROM "MarketIntelligenceEconomicScenario"
                WHERE "organizationId"=${organizationId} AND "snapshotHash"=${snapshotHash}
                LIMIT 1
            `);
            if (!existing[0]) throw new AppError('Falha ao recuperar cenário econômico idempotente.', 500);
            return existing[0];
        });
        return toDetail(row);
    },

    async list(organizationId: string, query: EconomicScenarioListQuery): Promise<SavedEconomicScenarioSummary[]> {
        const rows = await withRlsContext((tx) => tx.$queryRaw<ScenarioRow[]>(Prisma.sql`
            SELECT "id","organizationId","createdBy","label","territoryId","baseCity","uf","radiusKm",
                   "commercialScenario","recommendation","auditVersion","methodologyVersion","economicModelVersion",
                   "calibrationVersion","calibrationApplied","calibrationQuality","tamAccounts","samAccounts",
                   "monthlyFixedCost","paybackMonth","roi12Pct","roi24Pct","snapshotHash","createdAt"
            FROM "MarketIntelligenceEconomicScenario"
            WHERE "organizationId"=${organizationId}
            ORDER BY "createdAt" DESC
            LIMIT ${query.limit}
        `));
        return rows.map(toSummary);
    },

    async get(organizationId: string, id: string): Promise<SavedEconomicScenario> {
        const rows = await withRlsContext((tx) => tx.$queryRaw<ScenarioRow[]>(Prisma.sql`
            SELECT * FROM "MarketIntelligenceEconomicScenario"
            WHERE "organizationId"=${organizationId} AND "id"=${id}
            LIMIT 1
        `));
        if (!rows[0]) throw new AppError('Cenário econômico não encontrado.', 404);
        return toDetail(rows[0]);
    },
};
