import { afterAll, afterEach, describe, expect, it } from 'vitest';

/**
 * Prova, contra Postgres real, que o worker de insights do LDR (D.1/D.3/D.4/D.5 do audit da
 * Fase 0 — `.agents/runs/ldr-fase-0-auditoria.md`) calcula Account Score, gera Next Best Action,
 * classifica decisores reais (D.3) e liga contas do mesmo grupo econômico por raiz de CNPJ (D.4)
 * — tudo a partir de dado real persistido (nunca fabricado), com descoberta cross-tenant segura
 * (bypass restrito a `Organization` — ver `BYPASS_RLS_ALLOWED_MODELS` em `src/lib/prisma.ts`) e
 * idempotência real (rodar duas vezes não duplica linha).
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
            await prisma.economicRelationship.deleteMany({ where: { organizationId } });
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

    it('D.3: classifica um DecisionMaker real a partir do Contact, nunca reclassifica um já existente', async () => {
        const orgId = await createTestOrg();
        const { companyId, contactId, preExistingDecisionMakerId } = await asOrg(orgId, async () => {
            const company = await prisma.company.create({
                data: { legalName: 'Conta com Decisores Ltda.', tradeName: 'Conta Decisores', organizationId: orgId },
            });
            await prisma.accountIntelligenceSnapshot.create({
                data: {
                    organizationId: orgId,
                    companyId: company.id,
                    version: 1,
                    summary: 'Conta com Decisores — resumo factual de teste.',
                    structuredFacts: { legalName: company.legalName },
                    sourceStatus: { crm: { status: 'available' } },
                    status: 'Complete',
                },
            });
            const classifiableContact = await prisma.contact.create({
                data: {
                    name: 'Diretor Real',
                    role: 'Diretor de TI',
                    seniority: 'director',
                    department: 'Tecnologia',
                    companyId: company.id,
                    organizationId: orgId,
                },
            });
            const noSignalContact = await prisma.contact.create({
                data: { name: 'Contato Sem Cargo', companyId: company.id, organizationId: orgId },
            });
            // Já classificado por um humano antes — o worker nunca deve tocar este registro de novo.
            const preExisting = await prisma.decisionMaker.create({
                data: {
                    organizationId: orgId,
                    companyId: company.id,
                    contactId: noSignalContact.id,
                    buyingRole: 'Decisor Econômico',
                    roleEvidenceType: 'FACT',
                    source: 'human:verified',
                    confidence: 1,
                    status: 'Active',
                    verifiedAt: new Date(),
                },
            });
            return { companyId: company.id, contactId: classifiableContact.id, preExistingDecisionMakerId: preExisting.id };
        });

        await scanAndGenerateAccountInsights();

        await asOrg(orgId, async () => {
            const generated = await prisma.decisionMaker.findUnique({ where: { organizationId_companyId_contactId: { organizationId: orgId, companyId, contactId } } });
            expect(generated).not.toBeNull();
            expect(generated?.buyingRole).toBe('Influenciador Técnico');
            expect(generated?.roleEvidenceType).toBe('INFERENCE');
            expect(generated?.status).toBe('Unverified');
            expect(generated?.verifiedAt).toBeNull();

            const untouched = await prisma.decisionMaker.findUnique({ where: { id: preExistingDecisionMakerId } });
            expect(untouched).toMatchObject({ buyingRole: 'Decisor Econômico', roleEvidenceType: 'FACT', source: 'human:verified' });

            const total = await prisma.decisionMaker.count({ where: { organizationId: orgId, companyId } });
            expect(total).toBe(2);
        });
    });

    it('D.3: não cria DecisionMaker para Contact sem cargo, senioridade ou departamento reconhecível', async () => {
        const orgId = await createTestOrg();
        const companyId = await asOrg(orgId, async () => {
            const company = await prisma.company.create({
                data: { legalName: 'Conta Sem Sinal de Decisor Ltda.', tradeName: 'Conta Sem Sinal', organizationId: orgId },
            });
            await prisma.accountIntelligenceSnapshot.create({
                data: {
                    organizationId: orgId,
                    companyId: company.id,
                    version: 1,
                    summary: 'Conta Sem Sinal de Decisor — resumo factual de teste.',
                    structuredFacts: { legalName: company.legalName },
                    sourceStatus: { crm: { status: 'available' } },
                    status: 'Complete',
                },
            });
            await prisma.contact.create({
                data: { name: 'Contato Sem Nenhum Sinal', companyId: company.id, organizationId: orgId },
            });
            return company.id;
        });

        await scanAndGenerateAccountInsights();

        await asOrg(orgId, async () => {
            const count = await prisma.decisionMaker.count({ where: { organizationId: orgId, companyId } });
            expect(count).toBe(0);
        });
    });

    it('D.4: liga duas contas do mesmo tenant com a mesma raiz de CNPJ como MATRIZ_FILIAL, idempotente', async () => {
        const orgId = await createTestOrg();
        const cnpjRootDigits = `${Date.now()}`.slice(-8);
        const { matrizId, filialId } = await asOrg(orgId, async () => {
            const matriz = await prisma.company.create({
                data: {
                    legalName: 'Matriz Real Ltda.',
                    tradeName: 'Matriz Real',
                    organizationId: orgId,
                    cnpj: `${cnpjRootDigits}000191`,
                },
            });
            const filial = await prisma.company.create({
                data: {
                    legalName: 'Filial Real Ltda.',
                    tradeName: 'Filial Real',
                    organizationId: orgId,
                    cnpj: `${cnpjRootDigits}000272`,
                },
            });
            return { matrizId: matriz.id, filialId: filial.id };
        });

        await scanAndGenerateAccountInsights();
        await scanAndGenerateAccountInsights();

        await asOrg(orgId, async () => {
            const relationships = await prisma.economicRelationship.findMany({ where: { organizationId: orgId } });
            expect(relationships).toHaveLength(1);
            const [relationship] = relationships;
            expect(relationship).toMatchObject({
                relationType: 'MATRIZ_FILIAL',
                status: 'Verified',
                confidence: 1,
            });
            const pair = [relationship.sourceCompanyId, relationship.targetCompanyId].sort();
            expect(pair).toEqual([matrizId, filialId].sort());
        });
    });

    it('D.4: nunca liga empresas com a mesma raiz de CNPJ em organizações diferentes', async () => {
        const orgA = await createTestOrg();
        const orgB = await createTestOrg();
        const cnpjRootDigits = `${Date.now()}`.slice(-8);
        await asOrg(orgA, () => prisma.company.create({
            data: { legalName: 'Empresa Org A Ltda.', tradeName: 'Empresa Org A', organizationId: orgA, cnpj: `${cnpjRootDigits}000191` },
        }));
        await asOrg(orgB, () => prisma.company.create({
            data: { legalName: 'Empresa Org B Ltda.', tradeName: 'Empresa Org B', organizationId: orgB, cnpj: `${cnpjRootDigits}000272` },
        }));

        await scanAndGenerateAccountInsights();

        await asOrg(orgA, async () => {
            const relationships = await prisma.economicRelationship.findMany({ where: { organizationId: orgA } });
            expect(relationships).toHaveLength(0);
        });
    });
});
