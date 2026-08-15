import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHmac } from 'crypto';

/**
 * Webhook do 3CX Call Flow (/api/integrations/3cx/webhook) — mesmo padrão de segurança do webhook
 * do Birth Voices Hub: assinatura HMAC sobre o corpo cru, fail-closed (503) sem segredo configurado,
 * 401 com assinatura inválida. Este arquivo não existia antes desta auditoria — o webhook nunca
 * tinha tido nenhuma cobertura de teste própria.
 */

const processWebhookMock = vi.fn();

vi.mock('../../../../../src/features/integrations/threecx/threecx.service.js', () => ({
    process3CXWebhook: (...args: unknown[]) => processWebhookMock(...args),
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockEnv: Record<string, string | undefined> = { THREECX_WEBHOOK_SECRET: 'segredo-3cx-teste' };
vi.mock('../../../../../src/config/env.js', () => ({ env: mockEnv }));

const { threecxWebhookRouter } = await import('../../../../../src/features/integrations/threecx/threecx.routes');

function buildApp() {
    const app = express();
    app.use('/api/integrations/3cx/webhook', threecxWebhookRouter);
    return app;
}

function sign(body: string, secret = 'segredo-3cx-teste'): string {
    return createHmac('sha256', secret).update(body).digest('hex');
}

const payload = { event: 'call.ended', extension: '101', callId: 'call-abc' };
const rawBody = JSON.stringify(payload);

beforeEach(() => {
    mockEnv.THREECX_WEBHOOK_SECRET = 'segredo-3cx-teste';
    processWebhookMock.mockResolvedValue({ status: 'processed' });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/integrations/3cx/webhook', () => {
    it('responde 503 (fail-closed) quando THREECX_WEBHOOK_SECRET não está configurado', async () => {
        mockEnv.THREECX_WEBHOOK_SECRET = undefined;

        const res = await request(buildApp())
            .post('/api/integrations/3cx/webhook')
            .set('x-3cx-signature', sign(rawBody))
            .set('Content-Type', 'application/json')
            .send(rawBody);

        expect(res.status).toBe(503);
        expect(processWebhookMock).not.toHaveBeenCalled();
    });

    it('responde 401 com assinatura ausente, sem processar o payload', async () => {
        const res = await request(buildApp())
            .post('/api/integrations/3cx/webhook')
            .set('Content-Type', 'application/json')
            .send(rawBody);

        expect(res.status).toBe(401);
        expect(processWebhookMock).not.toHaveBeenCalled();
    });

    it('responde 401 com assinatura incorreta, sem processar o payload', async () => {
        const res = await request(buildApp())
            .post('/api/integrations/3cx/webhook')
            .set('x-3cx-signature', sign(rawBody, 'outro-segredo'))
            .set('Content-Type', 'application/json')
            .send(rawBody);

        expect(res.status).toBe(401);
        expect(processWebhookMock).not.toHaveBeenCalled();
    });

    it('responde 400 quando o corpo assinado não é JSON válido', async () => {
        const invalidBody = '{not-json';
        const res = await request(buildApp())
            .post('/api/integrations/3cx/webhook')
            .set('x-3cx-signature', sign(invalidBody))
            .set('Content-Type', 'application/json')
            .send(invalidBody);

        expect(res.status).toBe(400);
        expect(processWebhookMock).not.toHaveBeenCalled();
    });

    it('processa o payload com assinatura válida', async () => {
        const res = await request(buildApp())
            .post('/api/integrations/3cx/webhook')
            .set('x-3cx-signature', sign(rawBody))
            .set('Content-Type', 'application/json')
            .send(rawBody);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, data: { status: 'processed' } });
        expect(processWebhookMock).toHaveBeenCalledWith(payload);
    });

    it('responde 500 quando o processamento falha, sem vazar detalhe interno', async () => {
        processWebhookMock.mockRejectedValueOnce(new Error('boom'));

        const res = await request(buildApp())
            .post('/api/integrations/3cx/webhook')
            .set('x-3cx-signature', sign(rawBody))
            .set('Content-Type', 'application/json')
            .send(rawBody);

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
    });

    // Reentrega do mesmo evento (o PABX/Call Flow pode reenviar em timeout) não pode produzir efeito
    // colateral duplicado. `process3CXWebhook` hoje só loga e confirma o recebimento — não persiste
    // nenhum evento de chamada (ver handoff sobre a lacuna de contrato/persistência), então uma
    // reentrega é inerentemente idempotente por não ter NENHUM efeito a duplicar. Este teste
    // documenta esse estado explicitamente, para não ser confundido com "idempotência garantida por
    // dedupe" quando na verdade é "sem efeito nenhum para duplicar".
    it('reentrega do mesmo evento não produz efeito duplicado (processamento hoje é sem efeito colateral)', async () => {
        await request(buildApp())
            .post('/api/integrations/3cx/webhook')
            .set('x-3cx-signature', sign(rawBody))
            .set('Content-Type', 'application/json')
            .send(rawBody);
        await request(buildApp())
            .post('/api/integrations/3cx/webhook')
            .set('x-3cx-signature', sign(rawBody))
            .set('Content-Type', 'application/json')
            .send(rawBody);

        expect(processWebhookMock).toHaveBeenCalledTimes(2);
    });
});
