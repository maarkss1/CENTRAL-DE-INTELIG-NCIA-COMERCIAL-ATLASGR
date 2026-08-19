import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { PrismaCrm360Repository } from '../../src/features/crm360/infra/PrismaCrm360Repository';
import { crm360PublicRoutes } from '../../src/features/crm360/routes/crm360Public.routes';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { setupDI } from '../../src/shared/di/setup';

/**
 * Prova, contra Postgres real, o CYC-005 (onda 25): versionamento real de `CrmCommercialDocument`
 * (nunca sobrescreve o histórico) e rastreamento real de visualização via `publicToken` — antes
 * desta rodada, `CrmCommercialDocumentVersion` era tabela morta confirmada (zero linha escrita) e
 * `publicToken` nunca era lido em lugar nenhum (ver docs/CADENCE-CYCLE-AUDIT.md, CYC-005).
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORG = `test-proposal-versioning-${RUN_ID}`;

const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> => requestContext.run({ tenantId: organizationId }, fn);

const repo = new PrismaCrm360Repository();
const LINE_ITEM = { name: 'Consultoria', quantity: 1, unitPrice: 1000, discountPercent: 0, taxPercent: 0 };

/** `crm360PublicRoutes` resolve `Crm360Controller` via o container de DI real — precisa estar populado (`setupDI()`, mesma chamada que `server.ts` faz no boot) antes de qualquer request, mesmo padrão de `rbac-e2e-crm-operations.test.ts`. */
function buildPublicApp(): Express {
    const app = express();
    app.use('/api/public/proposals', crm360PublicRoutes);
    app.use(errorHandler);
    return app;
}

beforeAll(async () => {
    setupDI();
    await withRlsBypass(() => prisma.organization.create({ data: { id: ORG, name: 'Test Org (proposal versioning)' } }));
});

afterEach(async () => {
    await withRlsBypass(async () => {
        await prisma.crmCommercialDocumentVersion.deleteMany({ where: { organizationId: ORG } });
        await prisma.crmCommercialDocument.deleteMany({ where: { organizationId: ORG } });
    });
});

afterAll(async () => {
    await withRlsBypass(() => prisma.organization.deleteMany({ where: { id: ORG } }));
});

describe('CYC-005 — versionamento (createDocument / updateDocumentContent / listDocumentVersions)', () => {
    it('createDocument grava a versão 1 real (CrmCommercialDocumentVersion deixa de ser tabela morta)', async () => {
        const doc = await asOrg(ORG, () =>
            repo.createDocument(ORG, { type: 'Proposta', title: 'Proposta v1', currency: 'BRL', discount: 0, lineItems: [LINE_ITEM], status: 'Rascunho' } as never, 'user-1'),
        );

        const versions = await asOrg(ORG, () => repo.listDocumentVersions(ORG, doc.id));
        expect(versions).toHaveLength(1);
        expect(versions[0].versionNumber).toBe(1);
        expect(versions[0].snapshot.title).toBe('Proposta v1');
        expect(versions[0].changedBy).toBe('user-1');
    });

    it('updateDocumentContent cria versão 2 (nunca sobrescreve a 1) e atualiza os campos correntes do documento', async () => {
        const doc = await asOrg(ORG, () =>
            repo.createDocument(ORG, { type: 'Proposta', title: 'Proposta original', currency: 'BRL', discount: 0, lineItems: [LINE_ITEM], status: 'Rascunho' } as never, 'user-1'),
        );

        const updated = await asOrg(ORG, () =>
            repo.updateDocumentContent(
                ORG,
                doc.id,
                { title: 'Proposta revisada', currency: 'BRL', discount: 0, lineItems: [{ ...LINE_ITEM, quantity: 2 }], changeReason: 'Cliente pediu +1 unidade' } as never,
                'user-2',
            ),
        );
        expect(updated.title).toBe('Proposta revisada');
        expect(updated.total).toBe(2000);

        const versions = await asOrg(ORG, () => repo.listDocumentVersions(ORG, doc.id));
        expect(versions).toHaveLength(2);
        expect(versions.map((v) => v.versionNumber).sort()).toEqual([1, 2]);
        // Ordenado desc — a versão mais recente vem primeiro.
        expect(versions[0].versionNumber).toBe(2);
        expect(versions[0].snapshot.title).toBe('Proposta revisada');
        expect(versions[0].changedBy).toBe('user-2');
        expect(versions[0].changeReason).toBe('Cliente pediu +1 unidade');
        // A versão 1 continua intacta — nunca sobrescrita.
        expect(versions[1].snapshot.title).toBe('Proposta original');
    });

    it('3 edições sucessivas produzem 4 versões (1 da criação + 3 da edição), sempre incrementando', async () => {
        const doc = await asOrg(ORG, () =>
            repo.createDocument(ORG, { type: 'Proposta', title: 'v1', currency: 'BRL', discount: 0, lineItems: [LINE_ITEM], status: 'Rascunho' } as never, 'user-1'),
        );
        for (const title of ['v2', 'v3', 'v4']) {
            await asOrg(ORG, () => repo.updateDocumentContent(ORG, doc.id, { title, currency: 'BRL', discount: 0, lineItems: [LINE_ITEM] } as never, 'user-1'));
        }

        const versions = await asOrg(ORG, () => repo.listDocumentVersions(ORG, doc.id));
        expect(versions).toHaveLength(4);
        expect(versions.map((v) => v.versionNumber).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    });
});

describe('CYC-005 — sentAt (updateDocumentStatus)', () => {
    it('grava sentAt na primeira transição para Enviado, nunca sobrescreve numa transição seguinte', async () => {
        const doc = await asOrg(ORG, () =>
            repo.createDocument(ORG, { type: 'Proposta', title: 'x', currency: 'BRL', discount: 0, lineItems: [LINE_ITEM], status: 'Rascunho' } as never),
        );

        const sent = await asOrg(ORG, () => repo.updateDocumentStatus(ORG, doc.id, 'Enviado'));
        expect(sent.sentAt).not.toBeNull();
        const firstSentAt = sent.sentAt;

        // Transição de volta pra Enviado (ex.: reabrir negociação) não deve trocar o sentAt original.
        await asOrg(ORG, () => repo.updateDocumentStatus(ORG, doc.id, 'Recusado'));
        const sentAgain = await asOrg(ORG, () => repo.updateDocumentStatus(ORG, doc.id, 'Enviado'));
        expect(sentAgain.sentAt).toBe(firstSentAt);
    });
});

describe('CYC-005 — rastreamento real de visualização (publicToken)', () => {
    it('GET /:token/view transiciona Enviado -> Visualizado e grava viewCount/firstViewedAt/lastViewedAt reais', async () => {
        const doc = await asOrg(ORG, () =>
            repo.createDocument(ORG, { type: 'Proposta', title: 'Proposta pública', currency: 'BRL', discount: 0, lineItems: [LINE_ITEM], status: 'Rascunho' } as never),
        );
        await asOrg(ORG, () => repo.updateDocumentStatus(ORG, doc.id, 'Enviado'));
        const token = (await asOrg(ORG, () => prisma.crmCommercialDocument.findUniqueOrThrow({ where: { id: doc.id } }))).publicToken;

        const app = buildPublicApp();
        const res = await request(app).get(`/api/public/proposals/${token}/view`);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('Visualizado');
        expect(res.body.data.title).toBe('Proposta pública');

        const persisted = await asOrg(ORG, () => prisma.crmCommercialDocument.findUniqueOrThrow({ where: { id: doc.id } }));
        expect(persisted.status).toBe('Visualizado');
        expect(persisted.viewCount).toBe(1);
        expect(persisted.firstViewedAt).not.toBeNull();
        expect(persisted.lastViewedAt).not.toBeNull();
    });

    it('visualizações seguintes incrementam viewCount e lastViewedAt, sem regredir um status já avançado (ex.: Aceito)', async () => {
        const doc = await asOrg(ORG, () =>
            repo.createDocument(ORG, { type: 'Proposta', title: 'x', currency: 'BRL', discount: 0, lineItems: [LINE_ITEM], status: 'Rascunho' } as never),
        );
        await asOrg(ORG, () => repo.updateDocumentStatus(ORG, doc.id, 'Enviado'));
        await asOrg(ORG, () => repo.updateDocumentStatus(ORG, doc.id, 'Aceito'));
        const token = (await asOrg(ORG, () => prisma.crmCommercialDocument.findUniqueOrThrow({ where: { id: doc.id } }))).publicToken;

        const app = buildPublicApp();
        await request(app).get(`/api/public/proposals/${token}/view`);
        await request(app).get(`/api/public/proposals/${token}/view`);

        const persisted = await asOrg(ORG, () => prisma.crmCommercialDocument.findUniqueOrThrow({ where: { id: doc.id } }));
        expect(persisted.status).toBe('Aceito'); // nunca regride pra Visualizado
        expect(persisted.viewCount).toBe(2);
    });

    it('token inexistente devolve 404, sem lançar erro cru', async () => {
        const app = buildPublicApp();
        const res = await request(app).get('/api/public/proposals/00000000-0000-0000-0000-000000000000/view');
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });

    it('RLS: a rota pública enxerga e atualiza um documento de QUALQUER organização (o publicToken é a credencial, não o tenant)', async () => {
        const orgB = `${ORG}-other`;
        await withRlsBypass(() => prisma.organization.create({ data: { id: orgB, name: 'Outra org' } }));
        try {
            const doc = await asOrg(orgB, () =>
                repo.createDocument(orgB, { type: 'Proposta', title: 'Doc de outra org', currency: 'BRL', discount: 0, lineItems: [LINE_ITEM], status: 'Rascunho' } as never),
            );
            await asOrg(orgB, () => repo.updateDocumentStatus(orgB, doc.id, 'Enviado'));
            const token = (await asOrg(orgB, () => prisma.crmCommercialDocument.findUniqueOrThrow({ where: { id: doc.id } }))).publicToken;

            const app = buildPublicApp();
            const res = await request(app).get(`/api/public/proposals/${token}/view`);
            expect(res.status).toBe(200);
            expect(res.body.data.title).toBe('Doc de outra org');
        } finally {
            await withRlsBypass(async () => {
                await prisma.crmCommercialDocumentVersion.deleteMany({ where: { organizationId: orgB } });
                await prisma.crmCommercialDocument.deleteMany({ where: { organizationId: orgB } });
                await prisma.organization.deleteMany({ where: { id: orgB } });
            });
        }
    });
});
