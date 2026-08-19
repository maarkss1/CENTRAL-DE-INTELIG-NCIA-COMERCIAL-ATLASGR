import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountIntelligenceService } from '@/features/market-intelligence/server/accountIntelligence.service.js';

const NOW = new Date('2026-08-18T12:00:00.000Z');

function companyFixture(overrides: Record<string, unknown> = {}) {
    return {
        id: 'company-a',
        legalName: 'Conta Real Ltda.',
        tradeName: null,
        cnpj: null,
        segment: null,
        cnae: null,
        size: null,
        employeeCount: null,
        estimatedRevenue: null,
        website: null,
        city: null,
        state: null,
        situacaoCadastral: null,
        naturezaJuridica: null,
        capitalSocial: null,
        dataAbertura: null,
        enrichmentStatus: null,
        enrichmentSource: null,
        enrichedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
    };
}

function createDbDouble() {
    const companyFindFirst = vi.fn().mockResolvedValue(companyFixture());
    const snapshotFindFirst = vi.fn().mockResolvedValue(null);
    const snapshotCreate = vi.fn();
    const scoreFindFirst = vi.fn().mockResolvedValue(null);
    const scoreCreate = vi.fn();
    const signalFindMany = vi.fn().mockResolvedValue([]);
    const signalCount = vi.fn().mockResolvedValue(0);
    const signalCreate = vi.fn();
    const decisionMakerFindMany = vi.fn().mockResolvedValue([]);
    const decisionMakerCount = vi.fn().mockResolvedValue(0);
    const relationshipFindMany = vi.fn().mockResolvedValue([]);
    const relationshipCount = vi.fn().mockResolvedValue(0);
    const relationshipCreate = vi.fn();
    const recommendationFindMany = vi.fn().mockResolvedValue([]);
    const recommendationCount = vi.fn().mockResolvedValue(0);
    const recommendationCreate = vi.fn();
    const evidenceFindMany = vi.fn().mockResolvedValue([]);
    const evidenceCount = vi.fn().mockResolvedValue(0);
    const evidenceCreateMany = vi.fn().mockResolvedValue({ count: 0 });

    const transaction = {
        accountIntelligenceSnapshot: {
            findFirst: snapshotFindFirst,
            create: snapshotCreate,
        },
        intelligenceEvidence: { createMany: evidenceCreateMany },
    };
    const runTransaction = vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));

    const db = {
        company: { findFirst: companyFindFirst },
        accountIntelligenceSnapshot: { findFirst: snapshotFindFirst, create: snapshotCreate },
        accountScore: { findFirst: scoreFindFirst, create: scoreCreate },
        accountSignal: { findMany: signalFindMany, count: signalCount, create: signalCreate },
        decisionMaker: { findMany: decisionMakerFindMany, count: decisionMakerCount },
        economicRelationship: {
            findMany: relationshipFindMany,
            count: relationshipCount,
            create: relationshipCreate,
        },
        accountRecommendation: {
            findMany: recommendationFindMany,
            count: recommendationCount,
            create: recommendationCreate,
        },
        intelligenceEvidence: {
            findMany: evidenceFindMany,
            count: evidenceCount,
            createMany: evidenceCreateMany,
        },
        $transaction: runTransaction,
    };

    return {
        db,
        companyFindFirst,
        snapshotFindFirst,
        snapshotCreate,
        scoreFindFirst,
        scoreCreate,
        signalFindMany,
        signalCount,
        signalCreate,
        decisionMakerFindMany,
        decisionMakerCount,
        relationshipFindMany,
        relationshipCount,
        relationshipCreate,
        recommendationFindMany,
        recommendationCount,
        recommendationCreate,
        evidenceFindMany,
        evidenceCount,
        evidenceCreateMany,
        runTransaction,
    };
}

type IntelligenceResult = {
    state: 'available' | 'not_refreshed';
    facts: null | { structuredFacts: unknown; sourceStatus: unknown; knowledgeType: string };
    latestInference: null | { calculation: unknown; knowledgeType: string };
};

function recursivelyCollectedKeys(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(recursivelyCollectedKeys);
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, nested]) => [key, ...recursivelyCollectedKeys(nested)]);
}

describe('AccountIntelligenceService — tenancy fail-closed', () => {
    it('inclui organizationId da sessão na busca da Company', async () => {
        const doubles = createDbDouble();
        const service = new AccountIntelligenceService(doubles.db as never, 'org-a');

        await service.getIntelligence('company-a');

        expect(doubles.companyFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'company-a', organizationId: 'org-a', deletedAt: null },
        }));
    });

    it('devolve o mesmo 404 seguro para id inexistente ou pertencente a outro tenant', async () => {
        const doubles = createDbDouble();
        doubles.companyFindFirst.mockResolvedValue(null);
        const service = new AccountIntelligenceService(doubles.db as never, 'org-a');

        await expect(service.getIntelligence('company-from-org-b')).rejects.toMatchObject({
            statusCode: 404,
            message: 'Conta não encontrada.',
        });
        expect(doubles.companyFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'company-from-org-b', organizationId: 'org-a', deletedAt: null },
        }));
    });

    it('falha fechado quando o tenant autenticado não foi informado', () => {
        const doubles = createDbDouble();

        expect(() => new AccountIntelligenceService(doubles.db as never, '')).toThrow(
            'Organização autenticada não informada.',
        );
    });
});

describe('AccountIntelligenceService — paginação e filtros tenant-safe', () => {
    it('pagina sinais com offset/limit numéricos e organizationId obrigatório', async () => {
        const doubles = createDbDouble();
        doubles.signalFindMany.mockResolvedValue([{ id: 'signal-a' }]);
        doubles.signalCount.mockResolvedValue(26);
        const service = new AccountIntelligenceService(doubles.db as never, 'org-a');

        const result = await service.listSignals('company-a', {
            page: 2,
            limit: 25,
            status: 'Active',
            evidenceType: 'FACT',
            type: 'expansion',
        });

        expect(result).toEqual({
            items: [{ id: 'signal-a' }],
            page: 2,
            limit: 25,
            total: 26,
            totalPages: 2,
            hasNextPage: false,
        });
        expect(doubles.signalFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                companyId: 'company-a',
                organizationId: 'org-a',
                status: 'Active',
                evidenceType: 'FACT',
                type: 'expansion',
            },
            skip: 25,
            take: 25,
        }));
        expect(doubles.signalCount).toHaveBeenCalledWith({
            where: {
                companyId: 'company-a',
                organizationId: 'org-a',
                status: 'Active',
                evidenceType: 'FACT',
                type: 'expansion',
            },
        });
    });

    it('não seleciona e-mail ou telefone ao listar decisores', async () => {
        const doubles = createDbDouble();
        doubles.decisionMakerFindMany.mockResolvedValue([{
            id: 'decision-maker-a',
            roleEvidenceType: 'FACT',
            contact: { id: 'contact-a', name: 'Contato Real' },
        }]);
        doubles.decisionMakerCount.mockResolvedValue(1);
        const service = new AccountIntelligenceService(doubles.db as never, 'org-a');

        await service.listDecisionMakers('company-a', { page: 1, limit: 20 });

        const query = doubles.decisionMakerFindMany.mock.calls[0]?.[0] as {
            where: { organizationId: string };
            select: { contact: { select: Record<string, boolean> } };
        };
        expect(query.where.organizationId).toBe('org-a');
        expect(query.select.contact.select).not.toHaveProperty('email');
        expect(query.select.contact.select).not.toHaveProperty('phone');
        expect(query.select.contact.select).not.toHaveProperty('whatsapp');
    });
});

describe('AccountIntelligenceService — refresh real, idempotente e sem fallback fabricado', () => {
    it('rejeita com 422 quando não existe fonte rastreável suficiente', async () => {
        const doubles = createDbDouble();
        doubles.companyFindFirst.mockResolvedValue(companyFixture());
        doubles.evidenceFindMany.mockResolvedValue([]);
        const service = new AccountIntelligenceService(doubles.db as never, 'org-a');

        await expect(service.refresh('company-a')).rejects.toMatchObject({ statusCode: 422 });
        expect(doubles.runTransaction).not.toHaveBeenCalled();
        expect(doubles.snapshotCreate).not.toHaveBeenCalled();
    });

    it('cria uma vez e reutiliza o mesmo snapshot quando a entrada factual não mudou', async () => {
        const doubles = createDbDouble();
        doubles.companyFindFirst.mockResolvedValue(companyFixture({
            cnpj: '00000000000100',
            website: 'https://conta-real.example',
            segment: 'Logística',
            city: 'São Paulo',
            state: 'SP',
        }));
        doubles.evidenceFindMany.mockResolvedValue([]);

        let persistedSnapshot: Record<string, unknown> | null = null;
        doubles.snapshotFindFirst.mockImplementation(async () => persistedSnapshot);
        doubles.snapshotCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
            persistedSnapshot = {
                id: 'snapshot-a-1',
                version: data.version,
                generatedAt: NOW,
                expiresAt: null,
                summary: data.summary,
                structuredFacts: data.structuredFacts,
                sourceStatus: data.sourceStatus,
                status: data.status,
                createdAt: NOW,
            };
            return persistedSnapshot;
        });
        const service = new AccountIntelligenceService(doubles.db as never, 'org-a');

        const first = await service.refresh('company-a');
        const second = await service.refresh('company-a');

        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        expect(first.snapshot).toMatchObject({ id: 'snapshot-a-1', version: 1, knowledgeType: 'FACT' });
        expect(second.snapshot).toMatchObject({ id: 'snapshot-a-1', version: 1, knowledgeType: 'FACT' });
        expect(doubles.snapshotCreate).toHaveBeenCalledTimes(1);
        expect(doubles.evidenceCreateMany).toHaveBeenCalledTimes(1);
        expect(doubles.evidenceCreateMany).toHaveBeenCalledWith(expect.objectContaining({
            skipDuplicates: true,
            data: expect.arrayContaining([
                expect.objectContaining({
                    organizationId: 'org-a',
                    companyId: 'company-a',
                    snapshotId: 'snapshot-a-1',
                    subjectType: 'COMPANY_FIELD',
                    evidenceType: 'FACT',
                }),
            ]),
        }));

        expect(doubles.scoreCreate).not.toHaveBeenCalled();
        expect(doubles.signalCreate).not.toHaveBeenCalled();
        expect(doubles.relationshipCreate).not.toHaveBeenCalled();
        expect(doubles.recommendationCreate).not.toHaveBeenCalled();
    });
});

describe('AccountIntelligenceService — proveniência explícita e sanitização', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('remove segredo, token, payload bruto e PII aninhada de fatos e cálculo de score', async () => {
        const doubles = createDbDouble();
        doubles.snapshotFindFirst.mockResolvedValue({
            id: 'snapshot-a-1',
            version: 1,
            generatedAt: NOW,
            expiresAt: null,
            summary: 'Resumo factual.',
            structuredFacts: {
                safe: 'preservado',
                apiKey: 'nao-pode-sair',
                nested: { rawPayload: { source: 'provider' }, city: 'São Paulo', email: 'pii@example.test' },
            },
            sourceStatus: { provider: { status: 'available', accessToken: 'nao-pode-sair' } },
            status: 'Complete',
            createdAt: NOW,
        });
        doubles.scoreFindFirst.mockResolvedValue({
            id: 'score-a',
            total: 80,
            fit: 80,
            timing: 80,
            intent: 80,
            relationship: 80,
            positiveReasons: [],
            negativeReasons: [],
            calculation: { safeWeight: 0.5, providerSecret: 'nao-pode-sair', phone: '+5511999999999' },
            scoreVersion: 'v1',
            calculatedAt: NOW,
        });
        const service = new AccountIntelligenceService(doubles.db as never, 'org-a');

        const result = await service.getIntelligence('company-a') as IntelligenceResult;
        const keys = recursivelyCollectedKeys(result).map((key) => key.toLowerCase());

        expect(result.facts?.knowledgeType).toBe('FACT');
        expect(result.latestInference?.knowledgeType).toBe('INFERENCE');
        expect(result.facts?.structuredFacts).toMatchObject({ safe: 'preservado', nested: { city: 'São Paulo' } });
        expect(result.latestInference?.calculation).toMatchObject({ safeWeight: 0.5 });
        expect(keys).not.toEqual(expect.arrayContaining([
            'apikey',
            'rawpayload',
            'email',
            'accesstoken',
            'providersecret',
            'phone',
        ]));
    });

    it('distingue relações verificadas/inferidas, recomendações e tipos de evidência', async () => {
        const doubles = createDbDouble();
        doubles.relationshipFindMany.mockResolvedValue([
            {
                id: 'relationship-fact',
                status: 'Verified',
                sourceCompanyId: 'company-a',
                targetCompanyId: 'company-b',
                sourceCompany: { id: 'company-a' },
                targetCompany: { id: 'company-b' },
            },
            {
                id: 'relationship-inference',
                status: 'Inferred',
                sourceCompanyId: 'company-c',
                targetCompanyId: 'company-a',
                sourceCompany: { id: 'company-c' },
                targetCompany: { id: 'company-a' },
            },
        ]);
        doubles.relationshipCount.mockResolvedValue(2);
        doubles.recommendationFindMany.mockResolvedValue([{ id: 'recommendation-a' }]);
        doubles.recommendationCount.mockResolvedValue(1);
        doubles.evidenceFindMany.mockResolvedValue([
            {
                id: 'evidence-fact',
                evidenceType: 'FACT',
                value: { safe: true, apiKey: 'nao-pode-sair', nested: { refreshToken: 'nao-pode-sair' } },
            },
            { id: 'evidence-inference', evidenceType: 'INFERENCE', value: { safe: true } },
            { id: 'evidence-recommendation', evidenceType: 'RECOMMENDATION', value: { safe: true } },
        ]);
        doubles.evidenceCount.mockResolvedValue(3);
        const service = new AccountIntelligenceService(doubles.db as never, 'org-a');

        const relationships = await service.listRelationships('company-a', { page: 1, limit: 20 });
        const recommendations = await service.listRecommendations('company-a', { page: 1, limit: 20 });
        const evidence = await service.listEvidence('company-a', { page: 1, limit: 20 });

        expect(relationships.items).toEqual([
            expect.objectContaining({
                id: 'relationship-fact',
                direction: 'outgoing',
                counterparty: { id: 'company-b' },
                knowledgeType: 'FACT',
            }),
            expect.objectContaining({
                id: 'relationship-inference',
                direction: 'incoming',
                counterparty: { id: 'company-c' },
                knowledgeType: 'INFERENCE',
            }),
        ]);
        expect(recommendations.items).toEqual([
            expect.objectContaining({ id: 'recommendation-a', knowledgeType: 'RECOMMENDATION' }),
        ]);
        expect(evidence.items.map((item) => (item as { evidenceType: string }).evidenceType))
            .toEqual(['FACT', 'INFERENCE', 'RECOMMENDATION']);
        expect(evidence.items[0]).toMatchObject({ value: { safe: true, nested: {} } });
        expect(recursivelyCollectedKeys(evidence.items).map((key) => key.toLowerCase()))
            .not.toEqual(expect.arrayContaining(['apikey', 'refreshtoken', 'rawpayload', 'secret']));
        expect(doubles.relationshipFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                organizationId: 'org-a',
                OR: [{ sourceCompanyId: 'company-a' }, { targetCompanyId: 'company-a' }],
            },
        }));
        expect(doubles.relationshipCount).toHaveBeenCalledWith({
            where: {
                organizationId: 'org-a',
                OR: [{ sourceCompanyId: 'company-a' }, { targetCompanyId: 'company-a' }],
            },
        });
    });
});
