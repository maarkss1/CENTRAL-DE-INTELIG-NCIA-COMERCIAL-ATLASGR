import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { createHmac } from 'crypto';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { PrismaCrm360Repository } from '../../src/features/crm360/infra/PrismaCrm360Repository';
import { crm360Routes } from '../../src/features/crm360/routes/crm360.routes';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { setupDI } from '../../src/shared/di/setup';

/**
 * CYC-006 (onda 28) — prova, contra Postgres real, que `POST
 * /api/crm/documents/:id/request-signature` conecta um caminho de escrita real
 * (`CrmDocumentSignatureRequest` sai da lista de tabelas mortas), e que o webhook de status
 * (`signatureStatus.webhook.ts`) aplica atualizações reais respeitando o guardrail de transição
 * (`isValidSignatureTransition`) — nunca reverte um estado terminal já aplicado.
 */

const SECRET = 'segredo-signature-integration-teste';

// `env` (src/config/env.ts) parseia process.env uma única vez, no import — mesmo esquema de
// `emailReplyTracking.test.ts`: `importOriginal` preserva o resto do `env` real (conexão de
// Postgres/Redis) e só sobrescreve o segredo do webhook.
vi.mock('../../src/config/env.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/config/env.js')>();
    return { ...actual, env: { ...actual.env, SIGNATURE_INBOUND_WEBHOOK_SECRET: 'segredo-signature-integration-teste' } };
});

const { signatureStatusWebhookRoutes } = await import('../../src/features/integrations/signature/signatureStatus.webhook');

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORG = `test-doc-signature-${RUN_ID}`;

const withRlsBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);
const asOrg = <T>(organizationId: string, fn: () => Promise<T>): Promise<T> => requestContext.run({ tenantId: organizationId }, fn);

const repo = new PrismaCrm360Repository();
const LINE_ITEM = { name: 'Consultoria', quantity: 1, unitPrice: 1000, discountPercent: 0, taxPercent: 0 };

function buildApp(role = 'GESTOR', organizationId = ORG): Express {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: { id: string; email: string; organizationId: string; role: string } }).user = {
            id: 'test-user', email: 'vendedor@atlasgr.com.br', organizationId, role,
        };
        requestContext.run({ tenantId: organizationId }, () => next());
    });
    app.use('/api/crm', crm360Routes);
    app.use(errorHandler);
    return app;
}

function buildWebhookApp(): Express {
    const app = express();
    app.use('/api/webhooks/signature', signatureStatusWebhookRoutes);
    return app;
}

function sign(body: string): string {
    return createHmac('sha256', SECRET).update(body).digest('hex');
}

async function postWebhook(payload: Record<string, unknown>) {
    const body = JSON.stringify(payload);
    return request(buildWebhookApp())
        .post('/api/webhooks/signature/webhook')
        .set('x-signature-webhook-signature', sign(body))
        .set('Content-Type', 'application/json')
        .send(body);
}

async function seedDocumentWithContact(organizationId: string, contactEmail: string | null = 'signer@exemplo.com') {
    return asOrg(organizationId, async () => {
        const company = await prisma.company.create({ data: { legalName: 'Empresa Teste', tradeName: 'Empresa Teste', organizationId } });
        const contact = contactEmail
            ? await prisma.contact.create({ data: { name: 'Assinante Teste', email: contactEmail, companyId: company.id, organizationId } })
            : null;
        return prisma.crmCommercialDocument.create({
            data: {
                organizationId,
                number: `DOC-${Date.now()}`,
                type: 'Contrato',
                title: 'Contrato de teste',
                currency: 'BRL',
                lineItems: [LINE_ITEM],
                companyId: company.id,
                contactId: contact?.id,
            },
        });
    });
}

beforeAll(async () => {
    setupDI();
    await withRlsBypass(() => prisma.organization.create({ data: { id: ORG, name: 'Test Org (document signature)' } }));
});

afterEach(async () => {
    await withRlsBypass(async () => {
        await prisma.crmDocumentSignatureRequest.deleteMany({ where: { organizationId: ORG } });
        await prisma.crmCommercialDocument.deleteMany({ where: { organizationId: ORG } });
        await prisma.contact.deleteMany({ where: { organizationId: ORG } });
        await prisma.company.deleteMany({ where: { organizationId: ORG } });
    });
});

afterAll(async () => {
    await withRlsBypass(() => prisma.organization.deleteMany({ where: { id: ORG } }));
});

describe('POST /api/crm/documents/:id/request-signature (Postgres real)', () => {
    it('cria a solicitação real (CrmDocumentSignatureRequest sai de tabela morta) usando o e-mail do contato vinculado', async () => {
        const doc = await seedDocumentWithContact(ORG);

        const res = await request(buildApp()).post(`/api/crm/documents/${doc.id}/request-signature`).send({});

        expect(res.status).toBe(201);
        expect(res.body.data.providerRequestId).toMatch(/^stub-govbr-request-/);

        const persisted = await asOrg(ORG, () =>
            prisma.crmDocumentSignatureRequest.findUniqueOrThrow({ where: { id: res.body.data.id } }),
        );
        expect(persisted.organizationId).toBe(ORG);
        expect(persisted.documentId).toBe(doc.id);
        expect(persisted.provider).toBe('govbr');
        expect(persisted.status).toBe('Sent');
        expect(persisted.signerEmail).toBe('signer@exemplo.com');
        expect(persisted.requestedBy).toBe('test-user');
    });

    it('signerEmail explícito no body sobrescreve o e-mail do contato', async () => {
        const doc = await seedDocumentWithContact(ORG);

        const res = await request(buildApp())
            .post(`/api/crm/documents/${doc.id}/request-signature`)
            .send({ signerEmail: 'outro@exemplo.com', signerName: 'Outro Assinante' });

        expect(res.status).toBe(201);
        const persisted = await asOrg(ORG, () => prisma.crmDocumentSignatureRequest.findUniqueOrThrow({ where: { id: res.body.data.id } }));
        expect(persisted.signerEmail).toBe('outro@exemplo.com');
        expect(persisted.signerName).toBe('Outro Assinante');
    });

    it('422 quando o documento não tem contato vinculado nem signerEmail no body', async () => {
        const doc = await seedDocumentWithContact(ORG, null);

        const res = await request(buildApp()).post(`/api/crm/documents/${doc.id}/request-signature`).send({});

        expect(res.status).toBe(422);
        const requests = await asOrg(ORG, () => prisma.crmDocumentSignatureRequest.findMany({ where: { documentId: doc.id } }));
        expect(requests).toHaveLength(0);
    });

    it('404 quando o documento não existe nesta organização', async () => {
        const res = await request(buildApp()).post('/api/crm/documents/doc-inexistente/request-signature').send({});
        expect(res.status).toBe(404);
    });

    it('400 quando signerEmail informado não é um e-mail válido', async () => {
        const doc = await seedDocumentWithContact(ORG);
        const res = await request(buildApp()).post(`/api/crm/documents/${doc.id}/request-signature`).send({ signerEmail: 'não-é-email' });
        expect(res.status).toBe(400);
    });

    it('VISUALIZADOR não pode solicitar assinatura (requireRole)', async () => {
        const doc = await seedDocumentWithContact(ORG);
        const res = await request(buildApp('VISUALIZADOR')).post(`/api/crm/documents/${doc.id}/request-signature`).send({});
        expect(res.status).toBe(403);
    });
});

describe('POST /api/webhooks/signature/webhook (Postgres real, fluxo completo)', () => {
    it('created → sent → viewed → signed: cada transição real é aplicada e persistida', async () => {
        const doc = await seedDocumentWithContact(ORG);
        const createRes = await request(buildApp()).post(`/api/crm/documents/${doc.id}/request-signature`).send({});
        const providerRequestId = createRes.body.data.providerRequestId;

        const viewedRes = await postWebhook({ provider: 'govbr', providerRequestId, status: 'viewed' });
        expect(viewedRes.body).toEqual({ success: true, outcome: 'applied' });

        const signedRes = await postWebhook({ provider: 'govbr', providerRequestId, status: 'signed', evidenceRef: 'cert-abc-123' });
        expect(signedRes.body).toEqual({ success: true, outcome: 'applied' });

        const persisted = await asOrg(ORG, () =>
            prisma.crmDocumentSignatureRequest.findUniqueOrThrow({ where: { id: createRes.body.data.id } }),
        );
        expect(persisted.status).toBe('Signed');
        expect(persisted.evidenceRef).toBe('cert-abc-123');
        expect(persisted.respondedAt).not.toBeNull();
        expect(persisted.rawWebhookPayload).toMatchObject({ status: 'signed', evidenceRef: 'cert-abc-123' });
    });

    it('webhook atrasado depois de Signed (ex.: "sent" reentregue) é ignorado, nunca reverte o estado terminal', async () => {
        const doc = await seedDocumentWithContact(ORG);
        const createRes = await request(buildApp()).post(`/api/crm/documents/${doc.id}/request-signature`).send({});
        const providerRequestId = createRes.body.data.providerRequestId;

        await postWebhook({ provider: 'govbr', providerRequestId, status: 'signed', evidenceRef: 'cert-1' });

        const lateRes = await postWebhook({ provider: 'govbr', providerRequestId, status: 'sent' });
        expect(lateRes.body).toEqual({ success: true, outcome: 'ignored', reason: 'invalid-transition' });

        const persisted = await asOrg(ORG, () =>
            prisma.crmDocumentSignatureRequest.findUniqueOrThrow({ where: { id: createRes.body.data.id } }),
        );
        expect(persisted.status).toBe('Signed');
        expect(persisted.evidenceRef).toBe('cert-1'); // nunca sobrescrito pelo evento atrasado
    });

    it('providerRequestId desconhecido: outcome ignored (not-found), nunca 500', async () => {
        const res = await postWebhook({ provider: 'govbr', providerRequestId: 'id-que-nunca-existiu', status: 'signed' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, outcome: 'ignored', reason: 'not-found' });
    });
});
