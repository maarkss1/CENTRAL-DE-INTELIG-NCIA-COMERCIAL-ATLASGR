import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import type {
    DecisionMakerQuery,
    EvidenceQuery,
    RecommendationQuery,
    RelationshipQuery,
    SignalQuery,
} from './accountIntelligence.schemas.js';

type TenantDb = NonNullable<AuthRequest['db']>;
type KnowledgeType = 'FACT' | 'INFERENCE' | 'RECOMMENDATION';

export interface PaginationQuery {
    page: number;
    limit: number;
}

export interface PaginatedResult<T> {
    items: T[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
}

export interface RefreshResult {
    created: boolean;
    snapshot: unknown;
}

export interface AccountIntelligenceServiceContract {
    getIntelligence(accountId: string): Promise<unknown>;
    refresh(accountId: string): Promise<RefreshResult>;
    listSignals(accountId: string, query: SignalQuery): Promise<PaginatedResult<unknown>>;
    listDecisionMakers(accountId: string, query: DecisionMakerQuery): Promise<PaginatedResult<unknown>>;
    listRelationships(accountId: string, query: RelationshipQuery): Promise<PaginatedResult<unknown>>;
    listRecommendations(accountId: string, query: RecommendationQuery): Promise<PaginatedResult<unknown>>;
    listEvidence(accountId: string, query: EvidenceQuery): Promise<PaginatedResult<unknown>>;
}

const companySelect = {
    id: true,
    legalName: true,
    tradeName: true,
    cnpj: true,
    segment: true,
    cnae: true,
    size: true,
    employeeCount: true,
    estimatedRevenue: true,
    website: true,
    city: true,
    state: true,
    situacaoCadastral: true,
    naturezaJuridica: true,
    capitalSocial: true,
    dataAbertura: true,
    enrichmentStatus: true,
    enrichmentSource: true,
    enrichedAt: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.CompanySelect;

type AccountCompany = Prisma.CompanyGetPayload<{ select: typeof companySelect }>;

const snapshotSelect = {
    id: true,
    version: true,
    generatedAt: true,
    expiresAt: true,
    summary: true,
    structuredFacts: true,
    sourceStatus: true,
    status: true,
    createdAt: true,
} satisfies Prisma.AccountIntelligenceSnapshotSelect;

const scoreSelect = {
    id: true,
    total: true,
    fit: true,
    timing: true,
    intent: true,
    relationship: true,
    positiveReasons: true,
    negativeReasons: true,
    calculation: true,
    scoreVersion: true,
    calculatedAt: true,
} satisfies Prisma.AccountScoreSelect;

const signalSelect = {
    id: true,
    snapshotId: true,
    type: true,
    taxonomyVersion: true,
    title: true,
    description: true,
    detectedAt: true,
    effectiveAt: true,
    source: true,
    sourceUrl: true,
    confidence: true,
    evidenceType: true,
    status: true,
    firstSeenAt: true,
    lastSeenAt: true,
    occurrenceCount: true,
} satisfies Prisma.AccountSignalSelect;

const decisionMakerSelect = {
    id: true,
    snapshotId: true,
    buyingRole: true,
    department: true,
    seniority: true,
    roleEvidenceType: true,
    source: true,
    sourceUrl: true,
    verifiedAt: true,
    confidence: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    contact: {
        select: {
            id: true,
            name: true,
            role: true,
            department: true,
            seniority: true,
            linkedin: true,
            status: true,
        },
    },
} satisfies Prisma.DecisionMakerSelect;

const relationshipSelect = {
    id: true,
    snapshotId: true,
    sourceCompanyId: true,
    targetCompanyId: true,
    relationType: true,
    status: true,
    source: true,
    sourceUrl: true,
    confidence: true,
    detectedAt: true,
    verifiedAt: true,
    validFrom: true,
    validTo: true,
    sourceCompany: {
        select: {
            id: true,
            legalName: true,
            tradeName: true,
        },
    },
    targetCompany: {
        select: {
            id: true,
            legalName: true,
            tradeName: true,
        },
    },
} satisfies Prisma.EconomicRelationshipSelect;

const recommendationSelect = {
    id: true,
    snapshotId: true,
    accountScoreId: true,
    actionType: true,
    title: true,
    rationale: true,
    priority: true,
    expectedImpact: true,
    status: true,
    recommendationVersion: true,
    generatedBy: true,
    generatedAt: true,
    reviewedAt: true,
    reviewedBy: true,
    executedAt: true,
    externalRef: true,
    statusReason: true,
} satisfies Prisma.AccountRecommendationSelect;

const evidenceSelect = {
    id: true,
    snapshotId: true,
    subjectType: true,
    subjectId: true,
    factKey: true,
    value: true,
    reference: true,
    source: true,
    sourceUrl: true,
    collectedAt: true,
    confidence: true,
    evidenceType: true,
    createdAt: true,
} satisfies Prisma.IntelligenceEvidenceSelect;

const forbiddenResponseKeyFragments = [
    'authorization',
    'cookie',
    'password',
    'secret',
    'token',
    'apikey',
    'rawdata',
    'rawpayload',
    'phone',
    'whatsapp',
    'email',
];

function isForbiddenResponseKey(key: string): boolean {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    return forbiddenResponseKeyFragments.some((fragment) => normalized.includes(fragment));
}

function sanitizeJson(value: Prisma.JsonValue, depth = 0): Prisma.JsonValue {
    if (depth >= 6) return '[depth-limited]';
    if (Array.isArray(value)) {
        return value.slice(0, 100).map((item) => sanitizeJson(item, depth + 1));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => !isForbiddenResponseKey(key))
                .map(([key, item]) => [key, sanitizeJson(item ?? null, depth + 1)]),
        );
    }
    return value;
}

function canonicalize(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value);
}

function hashInput(value: unknown): string {
    return createHash('sha256').update(canonicalize(value)).digest('hex');
}

function getSnapshotInputHash(value: Prisma.JsonValue): string | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') return null;
    const inputHash = value.inputHash;
    return typeof inputHash === 'string' ? inputHash : null;
}

function toPaginated<T>(items: T[], total: number, query: PaginationQuery): PaginatedResult<T> {
    const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
    return {
        items,
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasNextPage: query.page < totalPages,
    };
}

function offset(query: PaginationQuery): number {
    return (query.page - 1) * query.limit;
}

function buildFactSet(company: AccountCompany): Record<string, { value: Prisma.JsonValue; evidenceType: 'FACT'; source: string }> {
    const crmFields: Array<[string, Prisma.JsonValue | null | undefined]> = [
        ['legalName', company.legalName],
        ['tradeName', company.tradeName],
        ['cnpj', company.cnpj],
        ['segment', company.segment],
        ['cnae', company.cnae],
        ['size', company.size],
        ['employeeCount', company.employeeCount],
        ['estimatedRevenue', company.estimatedRevenue],
        ['website', company.website],
        ['city', company.city],
        ['state', company.state],
    ];
    const enrichmentFields: Array<[string, Prisma.JsonValue | null | undefined]> = [
        ['situacaoCadastral', company.situacaoCadastral],
        ['naturezaJuridica', company.naturezaJuridica],
        ['capitalSocial', company.capitalSocial],
        ['dataAbertura', company.dataAbertura?.toISOString()],
    ];
    const facts: Record<string, { value: Prisma.JsonValue; evidenceType: 'FACT'; source: string }> = {};

    for (const [key, value] of crmFields) {
        if (value !== null && value !== undefined && value !== '') {
            facts[key] = { value, evidenceType: 'FACT', source: 'CRM.Company' };
        }
    }
    for (const [key, value] of enrichmentFields) {
        if (value !== null && value !== undefined && value !== '') {
            facts[key] = {
                value,
                evidenceType: 'FACT',
                source: company.enrichmentSource || 'CRM.Company.enrichment',
            };
        }
    }
    return facts;
}

function buildSummary(company: AccountCompany): string {
    const name = company.tradeName || company.legalName;
    const location = [company.city, company.state].filter(Boolean).join('/');
    const qualifiers = [company.segment, location].filter(Boolean).join(' — ');
    return qualifiers ? `${name} — ${qualifiers}.` : `${name}.`;
}

function isUniqueOrSerializationConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034');
}

export class AccountIntelligenceService implements AccountIntelligenceServiceContract {
    constructor(
        private readonly db: TenantDb,
        private readonly organizationId: string,
    ) {
        if (!organizationId) throw new AppError('Organização autenticada não informada.', 403);
    }

    private async requireCompany(accountId: string): Promise<AccountCompany> {
        const company = await this.db.company.findFirst({
            where: { id: accountId, organizationId: this.organizationId, deletedAt: null },
            select: companySelect,
        });
        if (!company) {
            // Mesmo resultado para ID inexistente e conta de outro tenant: não cria oráculo de enumeração.
            throw new AppError('Conta não encontrada.', 404);
        }
        return company;
    }

    async getIntelligence(accountId: string): Promise<unknown> {
        const company = await this.requireCompany(accountId);
        const [latestSnapshot, latestScore, signals, decisionMakers, relationships, recommendations, evidence] = await Promise.all([
            this.db.accountIntelligenceSnapshot.findFirst({
                where: { companyId: accountId, organizationId: this.organizationId },
                orderBy: [{ version: 'desc' }, { generatedAt: 'desc' }],
                select: snapshotSelect,
            }),
            this.db.accountScore.findFirst({
                where: { companyId: accountId, organizationId: this.organizationId },
                orderBy: { calculatedAt: 'desc' },
                select: scoreSelect,
            }),
            this.db.accountSignal.count({ where: { companyId: accountId, organizationId: this.organizationId } }),
            this.db.decisionMaker.count({ where: { companyId: accountId, organizationId: this.organizationId } }),
            this.db.economicRelationship.count({
                where: {
                    organizationId: this.organizationId,
                    OR: [{ sourceCompanyId: accountId }, { targetCompanyId: accountId }],
                },
            }),
            this.db.accountRecommendation.count({ where: { companyId: accountId, organizationId: this.organizationId } }),
            this.db.intelligenceEvidence.count({ where: { companyId: accountId, organizationId: this.organizationId } }),
        ]);

        return {
            account: company,
            state: latestSnapshot ? 'available' : 'not_refreshed',
            facts: latestSnapshot
                ? {
                    ...latestSnapshot,
                    structuredFacts: sanitizeJson(latestSnapshot.structuredFacts),
                    sourceStatus: sanitizeJson(latestSnapshot.sourceStatus),
                    knowledgeType: 'FACT' as KnowledgeType,
                }
                : null,
            latestInference: latestScore
                ? {
                    ...latestScore,
                    calculation: sanitizeJson(latestScore.calculation),
                    knowledgeType: 'INFERENCE' as KnowledgeType,
                }
                : null,
            collections: { signals, decisionMakers, relationships, recommendations, evidence },
        };
    }

    async refresh(accountId: string): Promise<RefreshResult> {
        const company = await this.requireCompany(accountId);
        const existingFacts = await this.db.intelligenceEvidence.findMany({
            where: {
                companyId: accountId,
                organizationId: this.organizationId,
                evidenceType: 'FACT',
            },
            select: {
                subjectType: true,
                factKey: true,
                value: true,
                valueHash: true,
                reference: true,
                source: true,
                dedupeKey: true,
            },
        });
        const hasTraceableIdentity = Boolean(
            company.cnpj
            || company.website
            || (company.enrichmentSource && company.enrichedAt)
            || existingFacts.length > 0,
        );
        if (!hasTraceableIdentity) {
            throw new AppError(
                'Não há fonte real suficiente para atualizar a inteligência desta conta. Informe CNPJ/site, conclua um enriquecimento rastreável ou registre uma evidência factual.',
                422,
            );
        }

        const facts = buildFactSet(company);
        const sourceStatus = {
            crm: { status: 'available', updatedAt: company.updatedAt.toISOString() },
            enrichment: company.enrichmentSource
                ? {
                    status: company.enrichmentStatus === 'Falhou' ? 'failed' : 'available',
                    source: company.enrichmentSource,
                    enrichedAt: company.enrichedAt?.toISOString() ?? null,
                }
                : { status: 'not_available' },
        };
        // Evidências geradas por este próprio refresh não entram no fingerprint, evitando que a
        // materialização mude a entrada e produza uma segunda versão espúria na chamada seguinte.
        const externalEvidenceFingerprint = existingFacts
            .filter((evidence) => evidence.subjectType !== 'COMPANY_FIELD')
            .map((evidence) => ({
                factKey: evidence.factKey,
                valueHash: evidence.valueHash ?? hashInput(evidence.value),
                reference: evidence.reference,
                source: evidence.source,
                dedupeKey: evidence.dedupeKey,
            }))
            .sort((left, right) => left.dedupeKey.localeCompare(right.dedupeKey));
        const inputHash = hashInput({
            facts,
            sourceStatus: {
                crm: 'available',
                enrichment: sourceStatus.enrichment,
            },
            externalEvidenceFingerprint,
        });
        const structuredFacts = { inputHash, company: facts };
        const status = company.enrichmentStatus === 'Falhou' || Object.keys(facts).length < 5 ? 'Partial' : 'Complete';

        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                return await this.db.$transaction(async (transaction) => {
                    const latest = await transaction.accountIntelligenceSnapshot.findFirst({
                        where: { companyId: accountId, organizationId: this.organizationId },
                        orderBy: [{ version: 'desc' }, { generatedAt: 'desc' }],
                        select: snapshotSelect,
                    });
                    if (latest && getSnapshotInputHash(latest.structuredFacts) === inputHash) {
                        return {
                            created: false,
                            snapshot: {
                                ...latest,
                                structuredFacts: sanitizeJson(latest.structuredFacts),
                                sourceStatus: sanitizeJson(latest.sourceStatus),
                                knowledgeType: 'FACT' as KnowledgeType,
                            },
                        };
                    }

                    const snapshot = await transaction.accountIntelligenceSnapshot.create({
                        data: {
                            organizationId: this.organizationId,
                            companyId: accountId,
                            version: (latest?.version ?? 0) + 1,
                            summary: buildSummary(company),
                            structuredFacts,
                            sourceStatus,
                            status,
                        },
                        select: snapshotSelect,
                    });

                    const evidenceRows = Object.entries(facts).map(([factKey, fact]) => {
                        const valueHash = hashInput(fact.value);
                        return {
                            organizationId: this.organizationId,
                            companyId: accountId,
                            snapshotId: snapshot.id,
                            subjectType: 'COMPANY_FIELD',
                            factKey,
                            value: fact.value as Prisma.InputJsonValue,
                            valueHash,
                            reference: `Company.${factKey}`,
                            source: fact.source,
                            evidenceType: 'FACT' as const,
                            dedupeKey: `company-field:${factKey}:${valueHash}`,
                        };
                    });
                    if (evidenceRows.length > 0) {
                        await transaction.intelligenceEvidence.createMany({
                            data: evidenceRows,
                            skipDuplicates: true,
                        });
                    }

                    return {
                        created: true,
                        snapshot: {
                            ...snapshot,
                            structuredFacts: sanitizeJson(snapshot.structuredFacts),
                            sourceStatus: sanitizeJson(snapshot.sourceStatus),
                            knowledgeType: 'FACT' as KnowledgeType,
                        },
                    };
                }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
            } catch (error) {
                if (!isUniqueOrSerializationConflict(error) || attempt === 1) throw error;
            }
        }
        throw new AppError('Não foi possível atualizar a inteligência da conta.', 409);
    }

    async listSignals(accountId: string, query: SignalQuery): Promise<PaginatedResult<unknown>> {
        await this.requireCompany(accountId);
        const where: Prisma.AccountSignalWhereInput = {
            companyId: accountId,
            organizationId: this.organizationId,
            ...(query.status ? { status: query.status } : {}),
            ...(query.evidenceType ? { evidenceType: query.evidenceType } : {}),
            ...(query.type ? { type: query.type } : {}),
        };
        const [items, total] = await Promise.all([
            this.db.accountSignal.findMany({
                where,
                orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
                skip: offset(query),
                take: query.limit,
                select: signalSelect,
            }),
            this.db.accountSignal.count({ where }),
        ]);
        return toPaginated(items, total, query);
    }

    async listDecisionMakers(accountId: string, query: DecisionMakerQuery): Promise<PaginatedResult<unknown>> {
        await this.requireCompany(accountId);
        const where: Prisma.DecisionMakerWhereInput = {
            companyId: accountId,
            organizationId: this.organizationId,
            ...(query.status ? { status: query.status } : {}),
            ...(query.buyingRole ? { buyingRole: query.buyingRole } : {}),
        };
        const [items, total] = await Promise.all([
            this.db.decisionMaker.findMany({
                where,
                orderBy: [{ confidence: 'desc' }, { id: 'desc' }],
                skip: offset(query),
                take: query.limit,
                select: decisionMakerSelect,
            }),
            this.db.decisionMaker.count({ where }),
        ]);
        return toPaginated(items, total, query);
    }

    async listRelationships(accountId: string, query: RelationshipQuery): Promise<PaginatedResult<unknown>> {
        await this.requireCompany(accountId);
        const where: Prisma.EconomicRelationshipWhereInput = {
            organizationId: this.organizationId,
            OR: [{ sourceCompanyId: accountId }, { targetCompanyId: accountId }],
            ...(query.status ? { status: query.status } : {}),
            ...(query.relationType ? { relationType: query.relationType } : {}),
        };
        const [rows, total] = await Promise.all([
            this.db.economicRelationship.findMany({
                where,
                orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
                skip: offset(query),
                take: query.limit,
                select: relationshipSelect,
            }),
            this.db.economicRelationship.count({ where }),
        ]);
        const items = rows.map((row) => ({
            ...row,
            direction: row.sourceCompanyId === accountId ? 'outgoing' : 'incoming',
            counterparty: row.sourceCompanyId === accountId ? row.targetCompany : row.sourceCompany,
            knowledgeType: (row.status === 'Verified' ? 'FACT' : 'INFERENCE') as KnowledgeType,
        }));
        return toPaginated(items, total, query);
    }

    async listRecommendations(accountId: string, query: RecommendationQuery): Promise<PaginatedResult<unknown>> {
        await this.requireCompany(accountId);
        const where: Prisma.AccountRecommendationWhereInput = {
            companyId: accountId,
            organizationId: this.organizationId,
            ...(query.status ? { status: query.status } : {}),
        };
        const [rows, total] = await Promise.all([
            this.db.accountRecommendation.findMany({
                where,
                orderBy: [{ priority: 'asc' }, { generatedAt: 'desc' }, { id: 'desc' }],
                skip: offset(query),
                take: query.limit,
                select: recommendationSelect,
            }),
            this.db.accountRecommendation.count({ where }),
        ]);
        const items = rows.map((row) => ({ ...row, knowledgeType: 'RECOMMENDATION' as KnowledgeType }));
        return toPaginated(items, total, query);
    }

    async listEvidence(accountId: string, query: EvidenceQuery): Promise<PaginatedResult<unknown>> {
        await this.requireCompany(accountId);
        const where: Prisma.IntelligenceEvidenceWhereInput = {
            companyId: accountId,
            organizationId: this.organizationId,
            ...(query.evidenceType ? { evidenceType: query.evidenceType } : {}),
            ...(query.subjectType ? { subjectType: query.subjectType } : {}),
        };
        const [rows, total] = await Promise.all([
            this.db.intelligenceEvidence.findMany({
                where,
                orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }],
                skip: offset(query),
                take: query.limit,
                select: evidenceSelect,
            }),
            this.db.intelligenceEvidence.count({ where }),
        ]);
        const items = rows.map((row) => ({ ...row, value: row.value === null ? null : sanitizeJson(row.value) }));
        return toPaginated(items, total, query);
    }
}
