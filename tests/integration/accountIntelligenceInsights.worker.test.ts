import { afterAll, afterEach, describe, expect, it } from 'vitest';

/**
 * Prova, contra Postgres real, que o worker de insights do LDR (D.1/D.5 do audit da Fase 0 —
 * `.agents/runs/ldr-fase-0-auditoria.md`) calcula Account Score e gera Next Best Action a partir
 * de dado real persistido (nunca fabricado), com descoberta cross-tenant segura (bypass restrito
 * a `Company`, reescopada por tenant real em seguida — ver `BYPASS_RLS_ALLOWED_MODELS` em
 * `src/lib/prisma.ts`) e idempotência real (rodar duas vezes não duplica linha).
 */

import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { scanAndGenerateAccountInsights } from '../../src/features/market-intelligence/jobs/accountIntelligenceInsights.worker';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> =>
    requestContext.run({ tenantId: organizationId }, fn);

let orgCounter = 0;
const createdOrgIds: string[] = [];
async function createTestOrg(): Promise<string> {
    const id = `test-account-insights-${RUN_ID}-${orgCounter++}`;
    createdOrgIds.push(id);
    await requestContext.run({ bypassRls: true }, () =>
        prisma.organization.create({ data: { id, name: `Test Org (account insights ${id})` } }));
    return id;
}

afterEach(async () => {
    // Só `Company` está na allowlist de bypass de RLS (ver `BYPASS_RLS_ALLOWED_MODELS` em
    // src/lib/prisma.ts) — as demais tabelas do LDR nunca tiveram bypass, então um `deleteMany`
    // sob bypass nelas silenciosamente apagaria 0 linhas (RLS nega visibilidade sem erro nenhum,
    // diferente de um UPDATE que falha alto contra WITH CHECK). Limpeza real precisa rodar
    // escopada por tenant, uma organização de cada vez.
    for (const organizationId of createdOrgIds) {
        await asOrg(organizationId, async () => {
            await prisma.accountRecommendation.deleteMany({ where: { organizationId } });
            await prisma.accountScore.deleteMany({ where: { organizationId } });
            await prisma.decisionMaker.deleteMany({ where: { organizationId } });
            await prisma.accountSignal.deleteMany({ where: { organizationId } });
            await prisma.accountIntelligenceSnapshot.deleteMany({ where: { organizationId } });
            await prisma.contact.deleteMany({ where: { organizationId } });
            await prisma.company.deleteMany({ where: { organizationId } });
        });
    }
});

afterAll(async () => {
    if (createdOrgIds.length === 0) return;
    await requestContext.run({ bypassRls: true }, () =>
        prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } }));
});

describe('scanAndGenerateAccountInsights — score e Next Best Action reais, contra Postgres', () => {
    it('gera AccountScore e AccountRecommendation ligados ao snapshot real, a partir de sinal e decisor reais', async () => {
        const orgId = await createTestOrg();
        const { companyId, decisionMakerId } = await asOrg(orgId, async () => {
            const company = await prisma.company.create({
                data: {
                    legalName: 'Conta Real de Insights Ltda.',
                    tradeName: 'Conta Real',
                    organizationId: orgId,
                    lookalikeScore: 68,
                },
            });
            await prisma.accountIntelligenceSnapshot.create({
                data: {
                    organizationId: orgId,
                    companyId: company.id,
                    version: 1,
                    summary: 'Conta Real — resumo factual de teste.',
                    structuredFacts: { legalName: company.legalName },
                    sourceStatus: { crm: { status: 'available' } },
                    status: 'Complete',
                },
            });
            await prisma.accountSignal.create({
                data: {
                    organizationId: orgId,
                    companyId: company.id,
                    type: 'news_mention',
                    taxonomyVersion: 'v1',
                    title: 'Menção real em notícia',
                    description: 'Empresa anuncia expansão real.',
                    source: 'example.com',
                    confidence: 0.85,
                    evidenceType: 'FACT',
                    status: 'Active',
                    dedupeKey: `news:${company.id}:real-url`,
                },
            });
            const contact = await prisma.contact.create({
                data: { name: 'Decisor Real', companyId: company.id, organizationId: orgId },
            });
            const decisionMaker = await prisma.decisionMaker.create({
                data: {
                    organizationId: orgId,
                    companyId: company.id,
                    contactId: contact.id,
                    buyingRole: 'ECONOMIC_DECISION_MAKER',
                    roleEvidenceType: 'INFERENCE',
                    source: 'CRM.Contact',
                    confidence: 0.7,
                    status: 'Active',
                    verifiedAt: new Date(),
                },
            });
            return { companyId: company.id, decisionMakerId: decisionMaker.id };
        });

        const result = await scanAndGenerateAccountInsights();
        expect(result.errors).toBe(0);
        expect(result.processed).toBeGreaterThanOrEqual(1);

        await asOrg(orgId, async () => {
            const score = await prisma.accountScore.findFirst({ where: { organizationId: orgId, companyId } });
            expect(score).not.toBeNull();
            expect(score?.fit).toBe(68);
            expect(score?.timing).toBeGreaterThan(0);
            expect(score?.relationship).toBeGreaterThan(0);
            expect(score?.total).toBeGreaterThan(0);
            expect(score?.total).toBeLessThanOrEqual(100);

            const recommendation = await prisma.accountRecommendation.findFirst({
                where: { organizationId: orgId, companyId },
            });
            expect(recommendation).not.toBeNull();
            // Decisor ativo + sinal ativo simultâneos → CREATE_BITRIX_TASK (ver decideNextBestAction).
            expect(recommendation?.actionType).toBe('CREATE_BITRIX_TASK');
            expect(recommendation?.status).toBe('Pending');
            expect(recommendation?.snapshotId).toBeTruthy();
            expect(recommendation?.accountScoreId).toBe(score?.id);
            expect(recommendation?.rationale).toContain('1');
        });

        void decisionMakerId;
    });

    it('roda duas vezes sem duplicar AccountScore nem AccountRecommendation (idempotente)', async () => {
        const orgId = await createTestOrg();
        const companyId = await asOrg(orgId, async () => {
            const company = await prisma.company.create({
                data: { legalName: 'Conta Idempotente Ltda.', tradeName: 'Conta Idempotente', organizationId: orgId, lookalikeScore: 40 },
            });
            await prisma.accountIntelligenceSnapshot.create({
                data: {
                    organizationId: orgId,
                    companyId: company.id,
                    version: 1,
                    summary: 'Conta Idempotente — resumo factual de teste.',
                    structuredFacts: { legalName: company.legalName },
                    sourceStatus: { crm: { status: 'available' } },
                    status: 'Complete',
                },
            });
            return company.id;
        });

        await scanAndGenerateAccountInsights();
        await scanAndGenerateAccountInsights();

        await asOrg(orgId, async () => {
            const scores = await prisma.accountScore.findMany({ where: { organizationId: orgId, companyId } });
            const recommendations = await prisma.accountRecommendation.findMany({
                where: { organizationId: orgId, companyId },
            });
            expect(scores).toHaveLength(1);
            expect(recommendations).toHaveLength(1);
        });
    });

    it('nunca escreve fora do tenant dono da conta', async () => {
        const orgA = await createTestOrg();
        const orgB = await createTestOrg();
        const companyId = await asOrg(orgA, async () => {
            const company = await prisma.company.create({
                data: { legalName: 'Conta Isolada Ltda.', tradeName: 'Conta Isolada', organizationId: orgA, lookalikeScore: 55 },
            });
            await prisma.accountIntelligenceSnapshot.create({
                data: {
                    organizationId: orgA,
                    companyId: company.id,
                    version: 1,
                    summary: 'Conta Isolada — resumo factual de teste.',
                    structuredFacts: { legalName: company.legalName },
                    sourceStatus: { crm: { status: 'available' } },
                    status: 'Complete',
                },
            });
            return company.id;
        });

        await scanAndGenerateAccountInsights();

        await asOrg(orgB, async () => {
            const leaked = await prisma.accountScore.findFirst({ where: { companyId } });
            expect(leaked).toBeNull();
        });
    });
});
