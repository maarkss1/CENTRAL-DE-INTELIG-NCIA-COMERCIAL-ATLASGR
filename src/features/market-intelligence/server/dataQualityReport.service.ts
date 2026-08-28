/**
 * Data Quality Report — consolida em UM relatório os sinais de qualidade/proveniência que já são
 * reais e computáveis a partir do estado atual do banco de Account Intelligence, mas hoje só
 * existem espalhados (ver o achado de auditoria em `DATA_LINEAGE.md`, seção "Estado publicado" por
 * fonte — o mesmo problema de dispersão existe aqui, um nível abaixo, no dado por conta/tenant).
 *
 * Mesmo espírito de `healthScore.ts`/`forecastAccuracy.ts` (src/features/commercial-intelligence):
 * nunca fabricar um número sobre dado ausente. Cada seção tem `available`/`reason` própria e só
 * carrega números quando existe população real para calculá-los. Nenhuma seção aqui inventa uma
 * métrica nova — cada uma é uma agregação direta de uma coluna/enum que já existe no schema:
 *
 * - `accountCoverage`   → quantas Companies do tenant têm ao menos um AccountIntelligenceSnapshot.
 * - `sourceStatus`      → distribuição de `AccountIntelligenceSnapshot.sourceStatus` (crm/enrichment)
 *                          do snapshot mais recente de cada conta.
 * - `snapshotFreshness` → idade do snapshot mais recente por conta (média/mín/máx) e quantos estão
 *                          `Stale` ou com `expiresAt` no passado.
 * - `evidenceCoverage`  → cobertura de `IntelligenceEvidence` por `evidenceType`.
 * - `signalCoverage`    → cobertura de `AccountSignal` por `type`/`status`.
 * - `decisionMakerVerification` → taxa de `DecisionMaker` com `verifiedAt` preenchido vs. não.
 * - `relationshipVerification`  → mesma pergunta para `EconomicRelationship.status` (Verified vs.
 *   Inferred/Rejected/Inactive) — extensão direta e real do mesmo padrão de "verificado vs. não".
 *
 * Puro e testável em isolamento (`computeDataQualityReport`): recebe os agregados já resolvidos por
 * quem chama (nenhum I/O aqui). `fetchDataQualityReportInputs` é a única função com I/O — faz as
 * queries (todas filtradas por `organizationId`, dentro do contexto RLS já aplicado pelo chamador).
 */
import type { Prisma } from '@prisma/client';

import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';

type TenantDb = NonNullable<AuthRequest['db']>;

// ─────────────────────────────── Entrada (dados já buscados) ───────────────────────────────

export interface LatestSnapshotRow {
    companyId: string;
    status: string;
    generatedAt: Date;
    expiresAt: Date | null;
    sourceStatus: Prisma.JsonValue;
}

export interface GroupCount {
    key: string;
    count: number;
}

export interface DataQualityReportRawInput {
    now: Date;
    totalAccounts: number;
    /** Um registro por conta: o snapshot de maior `version` (o mesmo critério de "mais recente"
     * usado em `AccountIntelligenceService.getIntelligence`). */
    latestSnapshots: LatestSnapshotRow[];
    evidenceByType: GroupCount[];
    totalEvidence: number;
    evidenceAccountCount: number;
    signalsByType: GroupCount[];
    signalsByStatus: GroupCount[];
    totalSignals: number;
    signalAccountCount: number;
    decisionMakerTotal: number;
    decisionMakerVerifiedCount: number;
    decisionMakerByStatus: GroupCount[];
    relationshipTotal: number;
    relationshipByStatus: GroupCount[];
}

// ─────────────────────────────────────── Saída (relatório) ───────────────────────────────────────

export interface AccountCoverageSection {
    available: boolean;
    reason: string | null;
    totalAccounts: number;
    accountsWithSnapshot: number | null;
    accountsWithoutSnapshot: number | null;
    coveragePct: number | null;
    byStatus: Record<string, number> | null;
}

export interface SourceStatusBreakdown {
    available: number;
    failed: number;
    notAvailable: number;
    unknown: number;
    total: number;
}

export interface SourceStatusSection {
    available: boolean;
    reason: string | null;
    accountsConsidered: number;
    crm: SourceStatusBreakdown | null;
    enrichment: SourceStatusBreakdown | null;
}

export interface SnapshotFreshnessSection {
    available: boolean;
    reason: string | null;
    accountsConsidered: number;
    averageAgeDays: number | null;
    oldestAgeDays: number | null;
    newestAgeDays: number | null;
    staleByStatusCount: number | null;
    staleByExpiresAtCount: number | null;
}

export interface EvidenceCoverageSection {
    available: boolean;
    reason: string | null;
    totalEvidence: number;
    accountsWithEvidence: number | null;
    byEvidenceType: Record<string, number> | null;
}

export interface SignalCoverageSection {
    available: boolean;
    reason: string | null;
    totalSignals: number;
    accountsWithSignals: number | null;
    byType: Record<string, number> | null;
    byStatus: Record<string, number> | null;
}

export interface DecisionMakerVerificationSection {
    available: boolean;
    reason: string | null;
    total: number;
    verifiedCount: number | null;
    unverifiedCount: number | null;
    verifiedRatePct: number | null;
    byStatus: Record<string, number> | null;
}

export interface RelationshipVerificationSection {
    available: boolean;
    reason: string | null;
    total: number;
    verifiedCount: number | null;
    nonVerifiedCount: number | null;
    verifiedRatePct: number | null;
    byStatus: Record<string, number> | null;
}

export interface DataQualityReport {
    generatedAt: string;
    accountCoverage: AccountCoverageSection;
    sourceStatus: SourceStatusSection;
    snapshotFreshness: SnapshotFreshnessSection;
    evidenceCoverage: EvidenceCoverageSection;
    signalCoverage: SignalCoverageSection;
    decisionMakerVerification: DecisionMakerVerificationSection;
    relationshipVerification: RelationshipVerificationSection;
}

// ────────────────────────────────────── Helpers puros ──────────────────────────────────────

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function pct(numerator: number, denominator: number): number | null {
    if (denominator <= 0) return null;
    return round2((numerator / denominator) * 100);
}

function toRecord(groups: GroupCount[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const group of groups) out[group.key] = group.count;
    return out;
}

function parseSourceStatusValue(value: Prisma.JsonValue): Record<string, unknown> | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') return null;
    return value as Record<string, unknown>;
}

function readNestedStatus(container: Record<string, unknown> | null, key: string): string | null {
    if (!container) return null;
    const nested = container[key];
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return null;
    const status = (nested as Record<string, unknown>).status;
    return typeof status === 'string' ? status : null;
}

function emptySourceBreakdown(): SourceStatusBreakdown {
    return { available: 0, failed: 0, notAvailable: 0, unknown: 0, total: 0 };
}

function accumulateSourceStatus(breakdown: SourceStatusBreakdown, status: string | null): void {
    breakdown.total += 1;
    if (status === 'available') breakdown.available += 1;
    else if (status === 'failed') breakdown.failed += 1;
    else if (status === 'not_available') breakdown.notAvailable += 1;
    else breakdown.unknown += 1;
}

// ───────────────────────────────────────── Agregação ─────────────────────────────────────────

function buildAccountCoverage(input: DataQualityReportRawInput): AccountCoverageSection {
    if (input.totalAccounts === 0) {
        return {
            available: false,
            reason: 'sem_contas_cadastradas_no_tenant',
            totalAccounts: 0,
            accountsWithSnapshot: null,
            accountsWithoutSnapshot: null,
            coveragePct: null,
            byStatus: null,
        };
    }
    const accountsWithSnapshot = input.latestSnapshots.length;
    const byStatus: Record<string, number> = {};
    for (const row of input.latestSnapshots) {
        byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    }
    return {
        available: true,
        reason: null,
        totalAccounts: input.totalAccounts,
        accountsWithSnapshot,
        accountsWithoutSnapshot: input.totalAccounts - accountsWithSnapshot,
        coveragePct: pct(accountsWithSnapshot, input.totalAccounts),
        byStatus,
    };
}

function buildSourceStatus(input: DataQualityReportRawInput): SourceStatusSection {
    if (input.latestSnapshots.length === 0) {
        return {
            available: false,
            reason: 'nenhuma_conta_possui_snapshot_ainda',
            accountsConsidered: 0,
            crm: null,
            enrichment: null,
        };
    }
    const crm = emptySourceBreakdown();
    const enrichment = emptySourceBreakdown();
    for (const row of input.latestSnapshots) {
        const parsed = parseSourceStatusValue(row.sourceStatus);
        accumulateSourceStatus(crm, readNestedStatus(parsed, 'crm'));
        accumulateSourceStatus(enrichment, readNestedStatus(parsed, 'enrichment'));
    }
    return {
        available: true,
        reason: null,
        accountsConsidered: input.latestSnapshots.length,
        crm,
        enrichment,
    };
}

function buildSnapshotFreshness(input: DataQualityReportRawInput): SnapshotFreshnessSection {
    if (input.latestSnapshots.length === 0) {
        return {
            available: false,
            reason: 'nenhuma_conta_possui_snapshot_ainda',
            accountsConsidered: 0,
            averageAgeDays: null,
            oldestAgeDays: null,
            newestAgeDays: null,
            staleByStatusCount: null,
            staleByExpiresAtCount: null,
        };
    }
    const nowMs = input.now.getTime();
    const ageDaysList = input.latestSnapshots.map((row) => (nowMs - row.generatedAt.getTime()) / 86_400_000);
    const averageAgeDays = round2(ageDaysList.reduce((sum, age) => sum + age, 0) / ageDaysList.length);
    const oldestAgeDays = round2(Math.max(...ageDaysList));
    const newestAgeDays = round2(Math.min(...ageDaysList));
    const staleByStatusCount = input.latestSnapshots.filter((row) => row.status === 'Stale').length;
    const staleByExpiresAtCount = input.latestSnapshots.filter(
        (row) => row.expiresAt != null && row.expiresAt.getTime() < nowMs,
    ).length;
    return {
        available: true,
        reason: null,
        accountsConsidered: input.latestSnapshots.length,
        averageAgeDays,
        oldestAgeDays,
        newestAgeDays,
        staleByStatusCount,
        staleByExpiresAtCount,
    };
}

function buildEvidenceCoverage(input: DataQualityReportRawInput): EvidenceCoverageSection {
    if (input.totalEvidence === 0) {
        return {
            available: false,
            reason: 'nenhuma_evidencia_registrada_no_tenant',
            totalEvidence: 0,
            accountsWithEvidence: null,
            byEvidenceType: null,
        };
    }
    return {
        available: true,
        reason: null,
        totalEvidence: input.totalEvidence,
        accountsWithEvidence: input.evidenceAccountCount,
        byEvidenceType: toRecord(input.evidenceByType),
    };
}

function buildSignalCoverage(input: DataQualityReportRawInput): SignalCoverageSection {
    if (input.totalSignals === 0) {
        return {
            available: false,
            reason: 'nenhum_sinal_registrado_no_tenant',
            totalSignals: 0,
            accountsWithSignals: null,
            byType: null,
            byStatus: null,
        };
    }
    return {
        available: true,
        reason: null,
        totalSignals: input.totalSignals,
        accountsWithSignals: input.signalAccountCount,
        byType: toRecord(input.signalsByType),
        byStatus: toRecord(input.signalsByStatus),
    };
}

function buildDecisionMakerVerification(input: DataQualityReportRawInput): DecisionMakerVerificationSection {
    if (input.decisionMakerTotal === 0) {
        return {
            available: false,
            reason: 'nenhum_decisor_registrado_no_tenant',
            total: 0,
            verifiedCount: null,
            unverifiedCount: null,
            verifiedRatePct: null,
            byStatus: null,
        };
    }
    return {
        available: true,
        reason: null,
        total: input.decisionMakerTotal,
        verifiedCount: input.decisionMakerVerifiedCount,
        unverifiedCount: input.decisionMakerTotal - input.decisionMakerVerifiedCount,
        verifiedRatePct: pct(input.decisionMakerVerifiedCount, input.decisionMakerTotal),
        byStatus: toRecord(input.decisionMakerByStatus),
    };
}

function buildRelationshipVerification(input: DataQualityReportRawInput): RelationshipVerificationSection {
    if (input.relationshipTotal === 0) {
        return {
            available: false,
            reason: 'nenhuma_relacao_economica_registrada_no_tenant',
            total: 0,
            verifiedCount: null,
            nonVerifiedCount: null,
            verifiedRatePct: null,
            byStatus: null,
        };
    }
    const verifiedCount = input.relationshipByStatus.find((group) => group.key === 'Verified')?.count ?? 0;
    return {
        available: true,
        reason: null,
        total: input.relationshipTotal,
        verifiedCount,
        nonVerifiedCount: input.relationshipTotal - verifiedCount,
        verifiedRatePct: pct(verifiedCount, input.relationshipTotal),
        byStatus: toRecord(input.relationshipByStatus),
    };
}

/**
 * Agrega os sinais de qualidade/proveniência já reais do módulo em um único relatório. Puro:
 * nenhuma consulta ao banco acontece aqui — só reduz o que `fetchDataQualityReportInputs` já
 * buscou. Cada seção declara `available:false` com `reason` em vez de forjar um número quando a
 * população subjacente está vazia.
 */
export function computeDataQualityReport(input: DataQualityReportRawInput): DataQualityReport {
    return {
        generatedAt: input.now.toISOString(),
        accountCoverage: buildAccountCoverage(input),
        sourceStatus: buildSourceStatus(input),
        snapshotFreshness: buildSnapshotFreshness(input),
        evidenceCoverage: buildEvidenceCoverage(input),
        signalCoverage: buildSignalCoverage(input),
        decisionMakerVerification: buildDecisionMakerVerification(input),
        relationshipVerification: buildRelationshipVerification(input),
    };
}

// ───────────────────────────────────────────── I/O ─────────────────────────────────────────────

/**
 * Única função deste arquivo com I/O. Todas as queries são filtradas por `organizationId` — o
 * chamador já roda dentro do contexto RLS (ver `AccountIntelligenceService`, que só é construído
 * com `req.db` autenticado/tenant-scoped). Nenhum agregado aqui promove `NAO_DISPONIVEL`/ausência a
 * zero silencioso: contagem real zero e "não computável" permanecem distinguíveis em
 * `computeDataQualityReport`.
 */
export async function fetchDataQualityReportInputs(
    db: TenantDb,
    organizationId: string,
    now: Date,
): Promise<DataQualityReportRawInput> {
    const [
        totalAccounts,
        latestSnapshots,
        evidenceByTypeRaw,
        totalEvidence,
        evidenceAccountsRaw,
        signalsByTypeRaw,
        signalsByStatusRaw,
        totalSignals,
        signalAccountsRaw,
        decisionMakerTotal,
        decisionMakerVerifiedCount,
        decisionMakerByStatusRaw,
        relationshipTotal,
        relationshipByStatusRaw,
    ] = await Promise.all([
        db.company.count({ where: { organizationId, deletedAt: null } }),
        // Um registro por conta: `distinct` + `orderBy` (companyId, version desc) mantém a primeira
        // linha de cada grupo, que é a de maior `version` — o mesmo critério de "snapshot mais
        // recente" usado em `AccountIntelligenceService.getIntelligence`/`refresh`.
        db.accountIntelligenceSnapshot.findMany({
            where: { organizationId },
            orderBy: [{ companyId: 'asc' }, { version: 'desc' }],
            distinct: ['companyId'],
            select: { companyId: true, status: true, generatedAt: true, expiresAt: true, sourceStatus: true },
        }),
        db.intelligenceEvidence.groupBy({ by: ['evidenceType'], where: { organizationId }, _count: { _all: true } }),
        db.intelligenceEvidence.count({ where: { organizationId } }),
        db.intelligenceEvidence.groupBy({ by: ['companyId'], where: { organizationId }, _count: { _all: true } }),
        db.accountSignal.groupBy({ by: ['type'], where: { organizationId }, _count: { _all: true } }),
        db.accountSignal.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } }),
        db.accountSignal.count({ where: { organizationId } }),
        db.accountSignal.groupBy({ by: ['companyId'], where: { organizationId }, _count: { _all: true } }),
        db.decisionMaker.count({ where: { organizationId } }),
        db.decisionMaker.count({ where: { organizationId, verifiedAt: { not: null } } }),
        db.decisionMaker.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } }),
        db.economicRelationship.count({ where: { organizationId } }),
        db.economicRelationship.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } }),
    ]);

    return {
        now,
        totalAccounts,
        latestSnapshots,
        evidenceByType: evidenceByTypeRaw.map((row) => ({ key: row.evidenceType, count: row._count._all })),
        totalEvidence,
        evidenceAccountCount: evidenceAccountsRaw.length,
        signalsByType: signalsByTypeRaw.map((row) => ({ key: row.type, count: row._count._all })),
        signalsByStatus: signalsByStatusRaw.map((row) => ({ key: row.status, count: row._count._all })),
        totalSignals,
        signalAccountCount: signalAccountsRaw.length,
        decisionMakerTotal,
        decisionMakerVerifiedCount,
        decisionMakerByStatus: decisionMakerByStatusRaw.map((row) => ({ key: row.status, count: row._count._all })),
        relationshipTotal,
        relationshipByStatus: relationshipByStatusRaw.map((row) => ({ key: row.status, count: row._count._all })),
    };
}
