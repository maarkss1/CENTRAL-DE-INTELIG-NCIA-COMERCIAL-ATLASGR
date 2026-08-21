import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHmac } from 'crypto';

/**
 * Webhook de e-mail de ENTRADA (CYC-003, onda 26) — stub de transporte. Mesmo padrão de teste de
 * `birthVoice.webhook.test.ts`: mocka prisma/env/contexto e bate no handler HTTP real via
 * supertest, com assinatura HMAC de verdade — prova o fail-closed, a idempotência, o filtro de
 * auto-resposta/bounce e a resolução de lead por e-mail do contato (ou por dica direta).
 */

const emailMessageFindUnique = vi.fn();
const emailMessageCreate = vi.fn().mockResolvedValue({});
const emailMessageFindMany = vi.fn().mockResolvedValue([]);
const leadFindFirst = vi.fn();
const timelineCreate = vi.fn().mockResolvedValue({});
const contextRuns: Array<Record<string, unknown>> = [];

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        emailMessage: {
            findUnique: (...args: unknown[]) => emailMessageFindUnique(...args),
            create: (...args: unknown[]) => emailMessageCreate(...args),
            findMany: (...args: unknown[]) => emailMessageFindMany(...args),
        },
        lead: {
            findFirst: (...args: unknown[]) => leadFindFirst(...args),
        },
        timelineEvent: {
            create: (...args: unknown[]) => timelineCreate(...args),
        },
    },
}));

vi.mock('../../../../../src/lib/async-context.js', () => ({
    requestContext: {
        run: (store: Record<string, unknown>, fn: () => unknown) => {
            contextRuns.push(store);
            return fn();
        },
        getStore: () => undefined,
    },
}));

const classify = vi.fn();
vi.mock('../../../../../src/features/cadence/infra/emailIntentClassifier.js', () => ({
    emailIntentClassifier: { classify: (...args: unknown[]) => classify(...args) },
}));

const signalRecord = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../src/features/cadence/infra/PrismaConversationSignalPort.js', () => ({
    prismaConversationSignalPort: { record: (...args: unknown[]) => signalRecord(...args) },
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockEnv: Record<string, string | undefined> = { EMAIL_INBOUND_WEBHOOK_SECRET: 'segredo-email-teste' };
vi.mock('../../../../../src/config/env.js', () => ({ env: mockEnv }));

const { emailReplyWebhookRoutes } = await import('../../../../../src/features/integrations/email/emailReply.webhook');

function buildApp() {
    const app = express();
    app.use('/api/webhooks/email', emailReplyWebhookRoutes);
    return app;
}

function sign(body: string, secret = 'segredo-email-teste'): string {
    return createHmac('sha256', secret).update(body).digest('hex');
}

function inboundPayload(overrides: Record<string, unknown> = {}) {
    return {
        organizationId: 'org-1',
        providerMessageId: '<msg-1@lead.com>',
        inReplyTo: '<out-1@atlasgr.com.br>',
        fromEmail: 'lead@empresa.com',
        toEmail: 'vendas@atlasgr.com.br',
        subject: 'Re: Proposta comercial',
        body: 'Fechado, pode enviar o contrato.',
        receivedAt: '2026-08-19T12:00:00.000Z',
        ...overrides,
    };
}

async function post(payload: Record<string, unknown>) {
    const body = JSON.stringify(payload);
    return request(buildApp())
        .post('/api/webhooks/email/webhook')
        .set('x-email-inbound-signature', sign(body))
        .set('Content-Type', 'application/json')
        .send(body);
}

beforeEach(() => {
    mockEnv.EMAIL_INBOUND_WEBHOOK_SECRET = 'segredo-email-teste';
    emailMessageFindUnique.mockResolvedValue(null);
    leadFindFirst.mockResolvedValue({ id: 'lead-1' });
    classify.mockResolvedValue({
        intent: 'alta_intencao_compra',
        urgency: 'alta',
        objections: [],
        budgetMentioned: false,
        nextStep: 'Enviar contrato',
        summary: 'Cliente fechou negócio e pediu o contrato.',
        confidence: 0.9,
        raw: {},
    });
});

afterEach(() => {
    vi.clearAllMocks();
    contextRuns.length = 0;
});

describe('POST /api/webhooks/email/webhook', () => {
    it('responde 503 (fail-closed) quando EMAIL_INBOUND_WEBHOOK_SECRET não está configurado', async () => {
        mockEnv.EMAIL_INBOUND_WEBHOOK_SECRET = undefined;

        const res = await post(inboundPayload());

        expect(res.status).toBe(503);
        expect(emailMessageCreate).not.toHaveBeenCalled();
    });

    it('responde 401 sem assinatura', async () => {
        const body = JSON.stringify(inboundPayload());
        const res = await request(buildApp())
            .post('/api/webhooks/email/webhook')
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(401);
        expect(emailMessageCreate).not.toHaveBeenCalled();
    });

    it('responde 401 com assinatura de outro segredo', async () => {
        const body = JSON.stringify(inboundPayload());
        const res = await request(buildApp())
            .post('/api/webhooks/email/webhook')
            .set('x-email-inbound-signature', sign(body, 'outro-segredo'))
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(401);
        expect(emailMessageCreate).not.toHaveBeenCalled();
    });

    it('responde 400 quando o corpo assinado não é JSON válido', async () => {
        const body = '{not-json';
        const res = await request(buildApp())
            .post('/api/webhooks/email/webhook')
            .set('x-email-inbound-signature', sign(body))
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(400);
        expect(emailMessageCreate).not.toHaveBeenCalled();
    });

    it('responde 400 quando faltam campos obrigatórios (organizationId/providerMessageId/fromEmail)', async () => {
        const res = await post({ providerMessageId: 'x', fromEmail: 'a@b.com' });
        expect(res.status).toBe(400);
        expect(emailMessageCreate).not.toHaveBeenCalled();
    });

    it('ignora auto-resposta/bounce por assunto — nunca vira EmailMessage nem ConversationSignal', async () => {
        const res = await post(inboundPayload({ subject: 'Out of Office' }));

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, outcome: 'ignored-auto-reply' });
        expect(emailMessageCreate).not.toHaveBeenCalled();
        expect(signalRecord).not.toHaveBeenCalled();
        expect(classify).not.toHaveBeenCalled();
    });

    it('ignora quando o header Auto-Submitted não é "no"', async () => {
        const res = await post(inboundPayload({ autoSubmittedHeader: 'auto-replied' }));

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, outcome: 'ignored-auto-reply' });
        expect(emailMessageCreate).not.toHaveBeenCalled();
    });

    it('réplica genuína com leadId de dica: persiste EmailMessage, classifica e grava o sinal + timeline dentro do tenant certo', async () => {
        const res = await post(inboundPayload({ leadId: 'lead-1' }));

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, outcome: 'recorded' });
        expect(contextRuns).toContainEqual({ tenantId: 'org-1' });
        expect(leadFindFirst).toHaveBeenCalledWith({ where: { id: 'lead-1', organizationId: 'org-1' }, select: { id: true } });
        expect(emailMessageCreate).toHaveBeenCalledTimes(1);
        expect(emailMessageCreate.mock.calls[0][0].data).toMatchObject({
            organizationId: 'org-1',
            providerMessageId: '<msg-1@lead.com>',
            direction: 'inbound',
            fromEmail: 'lead@empresa.com',
            toEmail: 'vendas@atlasgr.com.br',
            leadId: 'lead-1',
        });
        expect(classify).toHaveBeenCalledTimes(1);
        expect(signalRecord).toHaveBeenCalledWith(expect.objectContaining({
            organizationId: 'org-1',
            leadId: 'lead-1',
            channel: 'email',
            intent: 'alta_intencao_compra',
            summary: 'Cliente fechou negócio e pediu o contrato.',
        }));
        expect(timelineCreate).toHaveBeenCalledWith({
            data: {
                type: 'email',
                description: 'Resposta recebida por e-mail: "Re: Proposta comercial"',
                leadId: 'lead-1',
            },
        });
    });

    it('sem dica de leadId, resolve o lead pelo e-mail do contato (aberto, dentro da organização)', async () => {
        await post(inboundPayload());

        expect(leadFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                organizationId: 'org-1',
                contact: { email: { equals: 'lead@empresa.com', mode: 'insensitive' } },
            }),
        }));
    });

    it('é idempotente: reentrega do mesmo providerMessageId não duplica nem reclassifica', async () => {
        emailMessageFindUnique.mockResolvedValue({ id: 'email-existente' });

        const res = await post(inboundPayload());

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, outcome: 'duplicate' });
        expect(emailMessageCreate).not.toHaveBeenCalled();
        expect(classify).not.toHaveBeenCalled();
    });

    it('sem lead correspondente: persiste a mensagem para auditoria, mas não classifica nem grava sinal/timeline', async () => {
        leadFindFirst.mockResolvedValue(null);

        const res = await post(inboundPayload());

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, outcome: 'lead-not-found' });
        expect(emailMessageCreate).toHaveBeenCalledTimes(1);
        expect(emailMessageCreate.mock.calls[0][0].data.leadId).toBeUndefined();
        expect(classify).not.toHaveBeenCalled();
        expect(signalRecord).not.toHaveBeenCalled();
        expect(timelineCreate).not.toHaveBeenCalled();
    });
});
