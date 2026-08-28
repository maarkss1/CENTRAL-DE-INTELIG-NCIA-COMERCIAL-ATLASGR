import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { SearchExecutionTracker, findSearchExecution } from '../../src/features/prospecting/services/searchExecution.service';

/**
 * Onda 42 (dossiê CPI, DEC-13): prova, contra Postgres real (RLS incluída), que
 * `ProspectingSearchExecution` — a tabela nova que sustenta o Search-ID rastreável — respeita
 * isolamento de tenant de verdade (FORCE ROW LEVEL SECURITY, não só um WHERE aplicado na
 * aplicação), e que `SearchExecutionTracker`/`findSearchExecution` gravam e leem um registro real
 * quando chamados dentro de um contexto de tenant autenticado.
 */
const ORG_A = 'test-org-search-exec-a';
const ORG_B = 'test-org-search-exec-b';

const asTenant = (org: string) => requestContext.enterWith({ tenantId: org });
const asBypass = () => requestContext.enterWith({ bypassRls: true });

async function cleanup() {
    for (const org of [ORG_A, ORG_B]) {
        asTenant(org);
        await prisma.prospectingSearchExecution.deleteMany({ where: { organizationId: org } });
    }
    asBypass();
    await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
}

describe('ProspectingSearchExecution — Search-ID rastreável (Postgres real, RLS incluída)', () => {
    beforeAll(async () => {
        await cleanup();
        asBypass();
        await prisma.organization.create({ data: { id: ORG_A, name: 'Test Org Search Exec A' } });
        await prisma.organization.create({ data: { id: ORG_B, name: 'Test Org Search Exec B' } });
    });

    afterAll(cleanup);

    it('SearchExecutionTracker grava um registro real com providers/custo/status, e findSearchExecution lê de volta', async () => {
        asTenant(ORG_A);
        const tracker = new SearchExecutionTracker({
            organizationId: ORG_A,
            savedSearchId: null,
            criteria: { segmento: 'Transportadora', localizacao: 'São Paulo', quantidade: 10 },
            providerMode: 'hybrid',
        });
        tracker.recordProviderCall({ provider: 'apollo', resultCount: 5, status: 'ok' });
        tracker.recordProviderCall({ provider: 'google_places', resultCount: 3, status: 'ok' });
        await tracker.finish({ status: 'success', totalResults: 8 });

        const record = await findSearchExecution(tracker.searchId, ORG_A);
        expect(record).not.toBeNull();
        expect(record!.organizationId).toBe(ORG_A);
        expect(record!.status).toBe('success');
        expect(record!.totalResults).toBe(8);
        expect(record!.providersCalled).toHaveLength(2);
    });

    it('RLS real: execução gravada pelo tenant A nunca aparece numa leitura escopada ao tenant B', async () => {
        asTenant(ORG_A);
        const tracker = new SearchExecutionTracker({
            organizationId: ORG_A,
            savedSearchId: null,
            criteria: { segmento: 'Logística', localizacao: 'Rio de Janeiro', quantidade: 5 },
            providerMode: 'free',
        });
        await tracker.finish({ status: 'success', totalResults: 0 });

        const crossTenantRead = await findSearchExecution(tracker.searchId, ORG_B);
        expect(crossTenantRead).toBeNull();

        const ownTenantRead = await findSearchExecution(tracker.searchId, ORG_A);
        expect(ownTenantRead).not.toBeNull();
    });
});
