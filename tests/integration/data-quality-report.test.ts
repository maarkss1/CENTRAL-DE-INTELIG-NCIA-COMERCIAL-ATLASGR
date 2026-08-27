import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, withRlsContext } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { getTenantPrisma } from '../../src/lib/tenant-prisma';
import {
    computeDataQualityReport,
    fetchDataQualityReportInputs,
} from '../../src/features/market-intelligence/server/dataQualityReport.service';

/**
 * Onda 41: `fetchDataQualityReportInputs` é a única função I/O do relatório de qualidade de dados
 * (o resto — `computeDataQualityReport` e os `build*` privados — é puro e já coberto por teste
 * unitário). Contra Postgres real (RLS incluída via `getTenantPrisma`/`requestContext`), prova que
 * as 14 queries agregadas casam com `computeDataQualityReport` tanto na presença de dado real
 * quanto na ausência dele (seções `available:false` com motivo, nunca um número fabricado).
 *
 * `enterWith` (não `run`), no mesmo padrão de tests/integration/prospecting-rls.test.ts/
 * tests/helpers/integration-setup.ts: troca o tenant do RequestContext para o resto da execução
 * síncrona/assíncrona atual, sem embrulhar cada chamada num callback.
 */
const ORG = 'test-org-id-data-quality-report';
const ORG_EMPTY = 'test-org-id-data-quality-report-empty';
const COMPANY_A = 'test-dqr-company-a';
const COMPANY_B = 'test-dqr-company-b';
const CONTACT_ID = 'test-dqr-contact';
const SNAPSHOT_ID = 'test-dqr-snapshot';

const asTenant = (org: string) => requestContext.enterWith({ tenantId: org });
const asBypass = () => requestContext.enterWith({ bypassRls: true });

// ITEM-02 (20260825120000_scope_rls_bypass_to_bootstrap_allowlist) tirou a cláusula de bypass da
// policy de RLS de Company/Contact/AccountIntelligenceSnapshot/IntelligenceEvidence/AccountSignal/
// DecisionMaker/EconomicRelationship — só ficaram no allowlist de bypass as tabelas documentadas em
// BYPASS_RLS_ALLOWED_MODELS (src/lib/prisma.ts), e nenhuma dessas está lá. Por isso toda
// escrita/leitura destas tabelas roda com `asTenant(org)` ativo, nunca com bypass.
//
// Company/Contact são "auditáveis" na extensão $allOperations (src/lib/prisma.ts): um
// `deleteMany()` do client normal vira soft delete (seta `deletedAt`, não remove a linha) — a
// linha continua existindo com `organizationId` ainda apontando pro tenant. Se a Organization for
// removida depois (como faz este cleanup logo em seguida), o FK `Company.organizationId` (ON
// DELETE SET NULL) zera esse campo na linha órfã, que passa a ser invisível pra RLS e nunca mais é
// encontrada por um futuro `deleteMany({where:{organizationId}})` — colidindo por `id` na próxima
// vez que o teste tentar recriar a mesma fixture. Mesmo padrão de
// tests/integration/prospecting-rls.test.ts (`hardDeleteOrgData`): SQL cru via `withRlsContext`
// para as tabelas auditáveis, que ignora a interceptação de soft-delete do client normal.
async function cleanup() {
    for (const org of [ORG, ORG_EMPTY]) {
        asTenant(org);
        await prisma.decisionMaker.deleteMany({ where: { organizationId: org } });
        await prisma.accountSignal.deleteMany({ where: { organizationId: org } });
        await prisma.intelligenceEvidence.deleteMany({ where: { organizationId: org } });
        await prisma.economicRelationship.deleteMany({ where: { organizationId: org } });
        await prisma.accountIntelligenceSnapshot.deleteMany({ where: { organizationId: org } });
        await withRlsContext(async (tx) => {
            await tx.$executeRaw`DELETE FROM "Contact" WHERE "organizationId" = ${org}`;
            await tx.$executeRaw`DELETE FROM "Company" WHERE "organizationId" = ${org}`;
        });
    }
    asBypass();
    await prisma.organization.deleteMany({ where: { id: { in: [ORG, ORG_EMPTY] } } });
}

describe('Data Quality Report — fetchDataQualityReportInputs (Postgres real, RLS incluída)', () => {
    beforeAll(async () => {
        await cleanup();

        asBypass();
        await prisma.organization.create({ data: { id: ORG, name: 'Test Org DQR' } });
        await prisma.organization.create({ data: { id: ORG_EMPTY, name: 'Test Org DQR (vazia)' } });

        asTenant(ORG);
        await prisma.company.create({
            data: { id: COMPANY_A, organizationId: ORG, legalName: 'DQR Fixture A LTDA', tradeName: 'DQR A' },
        });
        await prisma.company.create({
            data: { id: COMPANY_B, organizationId: ORG, legalName: 'DQR Fixture B LTDA', tradeName: 'DQR B' },
        });
        await prisma.contact.create({
            data: { id: CONTACT_ID, name: 'Decisor DQR', companyId: COMPANY_A, organizationId: ORG },
        });
        await prisma.accountIntelligenceSnapshot.create({
            data: {
                id: SNAPSHOT_ID,
                organizationId: ORG,
                companyId: COMPANY_A,
                version: 1,
                summary: 'Snapshot de teste do relatório de qualidade de dados.',
                structuredFacts: {},
                sourceStatus: { crm: { status: 'available' }, enrichment: { status: 'failed' } },
                status: 'Complete',
            },
        });
        await prisma.intelligenceEvidence.create({
            data: {
                id: 'test-dqr-evidence',
                organizationId: ORG,
                companyId: COMPANY_A,
                snapshotId: SNAPSHOT_ID,
                subjectType: 'company',
                factKey: 'segmento',
                value: { segmento: 'Logística' },
                source: 'crm',
                evidenceType: 'FACT',
                dedupeKey: 'test-dqr-evidence-dedupe',
            },
        });
        await prisma.accountSignal.create({
            data: {
                id: 'test-dqr-signal',
                organizationId: ORG,
                companyId: COMPANY_A,
                snapshotId: SNAPSHOT_ID,
                type: 'intent',
                taxonomyVersion: 'v1',
                title: 'Sinal de teste',
                description: 'Sinal de teste para o relatório de qualidade de dados.',
                source: 'crm',
                confidence: 0.8,
                evidenceType: 'FACT',
                status: 'Active',
                dedupeKey: 'test-dqr-signal-dedupe',
            },
        });
        await prisma.decisionMaker.create({
            data: {
                id: 'test-dqr-decision-maker',
                organizationId: ORG,
                companyId: COMPANY_A,
                contactId: CONTACT_ID,
                snapshotId: SNAPSHOT_ID,
                buyingRole: 'economic_buyer',
                roleEvidenceType: 'FACT',
                source: 'crm',
                confidence: 0.9,
                status: 'Active',
                verifiedAt: new Date(),
            },
        });
        await prisma.economicRelationship.create({
            data: {
                id: 'test-dqr-relationship',
                organizationId: ORG,
                sourceCompanyId: COMPANY_A,
                targetCompanyId: COMPANY_B,
                relationType: 'parent',
                status: 'Verified',
                verifiedAt: new Date(),
                source: 'crm',
                confidence: 0.7,
                dedupeKey: 'test-dqr-relationship-dedupe',
            },
        });
    });

    afterAll(cleanup);

    it('agrega os 7 sinais reais quando o tenant tem dado em todas as tabelas', async () => {
        asTenant(ORG);
        const db = getTenantPrisma(ORG);
        const input = await fetchDataQualityReportInputs(db, ORG, new Date());
        const report = computeDataQualityReport(input);

        expect(report.accountCoverage).toMatchObject({
            available: true,
            totalAccounts: 2,
            accountsWithSnapshot: 1,
            accountsWithoutSnapshot: 1,
        });
        expect(report.sourceStatus.available).toBe(true);
        expect(report.sourceStatus.crm).toMatchObject({ available: 1, total: 1 });
        expect(report.sourceStatus.enrichment).toMatchObject({ failed: 1, total: 1 });
        expect(report.snapshotFreshness).toMatchObject({ available: true, accountsConsidered: 1 });
        expect(report.evidenceCoverage).toMatchObject({ available: true, totalEvidence: 1, accountsWithEvidence: 1 });
        expect(report.signalCoverage).toMatchObject({ available: true, totalSignals: 1, accountsWithSignals: 1 });
        expect(report.decisionMakerVerification).toMatchObject({
            available: true,
            total: 1,
            verifiedCount: 1,
            unverifiedCount: 0,
            verifiedRatePct: 100,
        });
        expect(report.relationshipVerification).toMatchObject({
            available: true,
            total: 1,
            verifiedCount: 1,
            nonVerifiedCount: 0,
            verifiedRatePct: 100,
        });
    });

    it('nunca fabrica número: tenant sem nenhuma conta devolve available:false com motivo em toda seção', async () => {
        asTenant(ORG_EMPTY);
        const db = getTenantPrisma(ORG_EMPTY);
        const input = await fetchDataQualityReportInputs(db, ORG_EMPTY, new Date());
        const report = computeDataQualityReport(input);

        expect(report.accountCoverage).toMatchObject({ available: false, reason: 'sem_contas_cadastradas_no_tenant' });
        expect(report.sourceStatus).toMatchObject({ available: false, reason: 'nenhuma_conta_possui_snapshot_ainda' });
        expect(report.evidenceCoverage).toMatchObject({
            available: false,
            reason: 'nenhuma_evidencia_registrada_no_tenant',
        });
        expect(report.signalCoverage).toMatchObject({ available: false, reason: 'nenhum_sinal_registrado_no_tenant' });
        expect(report.decisionMakerVerification).toMatchObject({
            available: false,
            reason: 'nenhum_decisor_registrado_no_tenant',
        });
        expect(report.relationshipVerification).toMatchObject({
            available: false,
            reason: 'nenhuma_relacao_economica_registrada_no_tenant',
        });
    });
});
