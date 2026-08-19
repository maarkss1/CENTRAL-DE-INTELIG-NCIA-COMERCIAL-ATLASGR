import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHmac } from 'crypto';

/**
 * Webhook de status de assinatura de ENTRADA (CYC-006, onda 28). Mesmo padrão de teste de
 * `emailReply.webhook.test.ts`: mocka o repositório e bate no handler HTTP real via supertest,
 * com assinatura HMAC de verdade — prova o fail-closed e que a rota nunca aplica um evento sem
 * passar pelo guardrail de transição real (`applySignatureStatusUpdate`, não mockado aqui).
 */

const findByProviderRequestId = vi.fn();
const updateStatus = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../../../src/features/cadence/infra/PrismaSignatureRequestRepository.js', () => ({
    prismaSignatureRequestRepository: {
        create: vi.fn(),
        markSent: vi.fn(),
        findByProviderRequestId: (...args: unknown[]) => findByProviderRequestId(...args),
        updateStatus: (...args: unknown[]) => updateStatus(...args),
    },
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockEnv: Record<string, string | undefined> = { SIGNATURE_INBOUND_WEBHOOK_SECRET: 'segredo-signature-teste' };
vi.mock('../../../../../src/config/env.js', () => ({ env: mockEnv }));

const { signatureStatusWebhookRoutes } = await import('../../../../../src/features/integrations/signature/signatureStatus.webhook');

function buildApp() {
    const app = express();
    app.use('/api/webhooks/signature', signatureStatusWebhookRoutes);
    return app;
}

function sign(body: string, secret = 'segredo-signature-teste'): string {
    return createHmac('sha256', secret).update(body).digest('hex');
}

function statusPayload(overrides: Record<string, unknown> = {}) {
    return {
        provider: 'govbr',
        providerRequestId: 'provider-request-1',
        status: 'signed',
        evidenceRef: 'cert-123',
        ...overrides,
    };
}

async function post(payload: Record<string, unknown>, signature?: string) {
    const body = JSON.stringify(payload);
    return request(buildApp())
        .post('/api/webhooks/signature/webhook')
        .set('x-signature-webhook-signature', signature ?? sign(body))
        .set('Content-Type', 'application/json')
        .send(body);
}

beforeEach(() => {
    mockEnv.SIGNATURE_INBOUND_WEBHOOK_SECRET = 'segredo-signature-teste';
    findByProviderRequestId.mockResolvedValue({ id: 'request-1', organizationId: 'org-1', status: 'sent' });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/webhooks/signature/webhook', () => {
    it('responde 503 (fail-closed) quando SIGNATURE_INBOUND_WEBHOOK_SECRET não está configurado', async () => {
        mockEnv.SIGNATURE_INBOUND_WEBHOOK_SECRET = undefined;

        const res = await post(statusPayload());

        expect(res.status).toBe(503);
        expect(updateStatus).not.toHaveBeenCalled();
    });

    it('responde 401 sem assinatura', async () => {
        const body = JSON.stringify(statusPayload());
        const res = await request(buildApp())
            .post('/api/webhooks/signature/webhook')
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(401);
        expect(updateStatus).not.toHaveBeenCalled();
    });

    it('responde 401 com assinatura de outro segredo', async () => {
        const res = await post(statusPayload(), sign(JSON.stringify(statusPayload()), 'outro-segredo'));

        expect(res.status).toBe(401);
        expect(updateStatus).not.toHaveBeenCalled();
    });

    it('responde 400 quando o corpo assinado não é JSON válido', async () => {
        const body = '{not-json';
        const res = await request(buildApp())
            .post('/api/webhooks/signature/webhook')
            .set('x-signature-webhook-signature', sign(body))
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(400);
    });

    it('responde 400 quando status não é um valor válido do domínio', async () => {
        const res = await post(statusPayload({ status: 'concluido' }));

        expect(res.status).toBe(400);
        expect(updateStatus).not.toHaveBeenCalled();
    });

    it('assinatura válida + transição válida: aplica e persiste', async () => {
        const res = await post(statusPayload());

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, outcome: 'applied' });
        expect(updateStatus).toHaveBeenCalledWith({ id: 'request-1', organizationId: 'org-1', status: 'signed', evidenceRef: 'cert-123', rawWebhookPayload: expect.objectContaining({ status: 'signed' }) });
    });

    it('solicitação inexistente: 200 com outcome ignored (nunca 5xx — reentregar não mudaria nada)', async () => {
        findByProviderRequestId.mockResolvedValueOnce(null);

        const res = await post(statusPayload());

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, outcome: 'ignored', reason: 'not-found' });
        expect(updateStatus).not.toHaveBeenCalled();
    });

    it('transição inválida (estado terminal já aplicado): 200 com outcome ignored, nunca reverte', async () => {
        findByProviderRequestId.mockResolvedValueOnce({ id: 'request-1', organizationId: 'org-1', status: 'signed' });

        const res = await post(statusPayload({ status: 'sent' }));

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, outcome: 'ignored', reason: 'invalid-transition' });
        expect(updateStatus).not.toHaveBeenCalled();
    });

    it('500 quando o repositório falha (provedor real deve reentregar)', async () => {
        updateStatus.mockRejectedValueOnce(new Error('boom'));

        const res = await post(statusPayload());

        expect(res.status).toBe(500);
    });
});
