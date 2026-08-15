import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * Webhook /api/webhooks/voice-result (Bland AI) — cobre exatamente os quatro defeitos que a
 * versão inline em server.ts tinha: segredo com fallback hardcoded, busca cross-tenant, ausência
 * de idempotência e corpo não parseado.
 */

const leadFindFirst = vi.fn();
const leadUpdate = vi.fn().mockResolvedValue({});
const noteFindFirst = vi.fn();
const noteCreate = vi.fn().mockResolvedValue({});
const timelineCreate = vi.fn().mockResolvedValue({});
const sendWhatsAppMessage = vi.fn().mockResolvedValue(undefined);
const notifyVoiceQualified = vi.fn();
const contextRuns: Array<Record<string, unknown>> = [];

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        lead: {
            findFirst: (...args: unknown[]) => leadFindFirst(...args),
            update: (...args: unknown[]) => leadUpdate(...args),
        },
        note: {
            findFirst: (...args: unknown[]) => noteFindFirst(...args),
            create: (...args: unknown[]) => noteCreate(...args),
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

vi.mock('../../../../../src/features/integrations/whatsapp/whatsapp.service.js', () => ({
    sendWhatsAppMessage: (...args: unknown[]) => sendWhatsAppMessage(...args),
}));

vi.mock('../../../../../src/features/notifications/sse.service.js', () => ({
    sseService: { notifyVoiceQualified: (...args: unknown[]) => notifyVoiceQualified(...args) },
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockEnv: Record<string, string | undefined> = { ATLASGR_WEBHOOK_SECRET: 'segredo-de-teste' };
vi.mock('../../../../../src/config/env.js', () => ({ env: mockEnv }));

const { voiceResultWebhookRoutes } = await import('../../../../../src/features/integrations/birth-voice/voiceResult.webhook');

function buildApp() {
    const app = express();
    app.use('/api/webhooks/voice-result', voiceResultWebhookRoutes);
    return app;
}

const VALID_HEADERS = { 'x-atlasgr-webhook-secret': 'segredo-de-teste' };

function blandPayload(overrides: Record<string, unknown> = {}) {
    return {
        call_id: 'call-123',
        phone_number: '+55 11 98877-6655',
        summary: 'Cliente interessado',
        concatenated_transcript: 'Conversa completa aqui',
        recording_url: 'https://example.com/rec.mp3',
        call_length: 2.5,
        request_data: { leadId: 'lead-1', organizationId: 'org-1' },
        ...overrides,
    };
}

beforeEach(() => {
    mockEnv.ATLASGR_WEBHOOK_SECRET = 'segredo-de-teste';
    leadFindFirst.mockResolvedValue({
        id: 'lead-1',
        organizationId: 'org-1',
        customFields: {},
        contact: { phone: '+5511988776655', whatsapp: null },
    });
    noteFindFirst.mockResolvedValue(null);
});

afterEach(() => {
    vi.clearAllMocks();
    contextRuns.length = 0;
});

describe('POST /api/webhooks/voice-result', () => {
    it('responde 503 (fail-closed) quando ATLASGR_WEBHOOK_SECRET não está configurado', async () => {
        mockEnv.ATLASGR_WEBHOOK_SECRET = undefined;

        const res = await request(buildApp())
            .post('/api/webhooks/voice-result')
            .set(VALID_HEADERS)
            .send(blandPayload());

        expect(res.status).toBe(503);
        expect(leadFindFirst).not.toHaveBeenCalled();
    });

    it('responde 401 com segredo errado, sem tocar o banco', async () => {
        const res = await request(buildApp())
            .post('/api/webhooks/voice-result')
            .set({ 'x-atlasgr-webhook-secret': 'errado' })
            .send(blandPayload());

        expect(res.status).toBe(401);
        expect(leadFindFirst).not.toHaveBeenCalled();
    });

    it('descarta payload sem organizationId sem varrer tenants (200, lead_found=false)', async () => {
        const res = await request(buildApp())
            .post('/api/webhooks/voice-result')
            .set(VALID_HEADERS)
            .send(blandPayload({ request_data: {} }));

        expect(res.status).toBe(200);
        expect(res.body.lead_found).toBe(false);
        expect(leadFindFirst).not.toHaveBeenCalled();
    });

    it('registra nota, timeline e voiceQualified dentro do contexto do tenant', async () => {
        const res = await request(buildApp())
            .post('/api/webhooks/voice-result')
            .set(VALID_HEADERS)
            .send(blandPayload());

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, lead_found: true, duplicate: false });

        // Toda a operação roda com o tenant do request_data no contexto (RLS).
        expect(contextRuns).toContainEqual({ tenantId: 'org-1' });
        // Lookup por id sempre filtrado pela organização — nunca busca global.
        expect(leadFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ id: 'lead-1', organizationId: 'org-1' }) }),
        );
        expect(noteCreate).toHaveBeenCalled();
        expect(timelineCreate).toHaveBeenCalled();
        expect(leadUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ customFields: expect.objectContaining({ voiceQualified: true }) }) }),
        );
        expect(notifyVoiceQualified).toHaveBeenCalledWith('org-1', 'lead-1', expect.any(String));
    });

    it('é idempotente: reentrega do mesmo call_id não duplica nota nem timeline', async () => {
        noteFindFirst.mockResolvedValue({ id: 'nota-existente' });

        const res = await request(buildApp())
            .post('/api/webhooks/voice-result')
            .set(VALID_HEADERS)
            .send(blandPayload());

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, lead_found: true, duplicate: true });
        expect(noteCreate).not.toHaveBeenCalled();
        expect(timelineCreate).not.toHaveBeenCalled();
        expect(leadUpdate).not.toHaveBeenCalled();
    });

    it('fallback por telefone fica restrito à organização do request_data', async () => {
        const res = await request(buildApp())
            .post('/api/webhooks/voice-result')
            .set(VALID_HEADERS)
            .send(blandPayload({ request_data: { organizationId: 'org-1' } }));

        expect(res.status).toBe(200);
        expect(leadFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
        );
    });

    it('responde 500 quando a escrita falha, para a Bland reentregar com backoff', async () => {
        noteCreate.mockRejectedValueOnce(new Error('db down'));

        const res = await request(buildApp())
            .post('/api/webhooks/voice-result')
            .set(VALID_HEADERS)
            .send(blandPayload());

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
    });

    describe('estado honesto do resultado (nunca infla voiceQualified)', () => {
        it('ligação não atendida (duração ínfima) NÃO marca voiceQualified, mesmo com resumo presente', async () => {
            const res = await request(buildApp())
                .post('/api/webhooks/voice-result')
                .set(VALID_HEADERS)
                .send(blandPayload({ call_length: 0.05, summary: 'Ligação não atendeu' }));

            expect(res.status).toBe(200);
            expect(leadUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        customFields: expect.objectContaining({ voiceQualified: false, voiceCallOutcome: 'no-answer' }),
                    }),
                }),
            );
        });

        it('caixa postal detectada no resumo NÃO marca voiceQualified', async () => {
            const res = await request(buildApp())
                .post('/api/webhooks/voice-result')
                .set(VALID_HEADERS)
                .send(blandPayload({ call_length: 0.3, summary: 'Caiu na caixa postal, deixe seu recado' }));

            expect(res.status).toBe(200);
            expect(leadUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        customFields: expect.objectContaining({ voiceQualified: false, voiceCallOutcome: 'voicemail' }),
                    }),
                }),
            );
        });

        it('conversa real (duração e resumo positivos) marca voiceQualified true', async () => {
            const res = await request(buildApp())
                .post('/api/webhooks/voice-result')
                .set(VALID_HEADERS)
                .send(blandPayload());

            expect(res.status).toBe(200);
            expect(leadUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        customFields: expect.objectContaining({ voiceQualified: true, voiceCallOutcome: 'completed' }),
                    }),
                }),
            );
        });

        it('sinal explícito de answered_by=machine tem prioridade sobre um resumo positivo', async () => {
            const res = await request(buildApp())
                .post('/api/webhooks/voice-result')
                .set(VALID_HEADERS)
                .send(blandPayload({ call_length: 3, summary: 'Conversa interessante', answered_by: 'machine' }));

            expect(res.status).toBe(200);
            expect(leadUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        customFields: expect.objectContaining({ voiceQualified: false, voiceCallOutcome: 'voicemail' }),
                    }),
                }),
            );
        });
    });

    describe('fallback WhatsApp — mensagem, opt-out e ausência de duplicidade', () => {
        it('envia a mensagem de "não conseguimos falar" quando a ligação não foi atendida', async () => {
            await request(buildApp())
                .post('/api/webhooks/voice-result')
                .set(VALID_HEADERS)
                .send(blandPayload({ call_length: 0.05, summary: 'não atendeu' }));

            expect(sendWhatsAppMessage).toHaveBeenCalledWith(
                'org-1',
                '+5511988776655',
                expect.stringContaining('não conseguimos falar'),
            );
        });

        it('envia a mensagem de agradecimento quando a ligação teve conversa real', async () => {
            await request(buildApp())
                .post('/api/webhooks/voice-result')
                .set(VALID_HEADERS)
                .send(blandPayload());

            expect(sendWhatsAppMessage).toHaveBeenCalledWith(
                'org-1',
                '+5511988776655',
                expect.stringContaining('Obrigado por conversar'),
            );
        });

        it('respeita optOutWhatsApp — nunca dispara nenhuma das duas mensagens', async () => {
            leadFindFirst.mockResolvedValue({
                id: 'lead-1',
                organizationId: 'org-1',
                customFields: { optOutWhatsApp: true },
                contact: { phone: '+5511988776655', whatsapp: null },
            });

            await request(buildApp())
                .post('/api/webhooks/voice-result')
                .set(VALID_HEADERS)
                .send(blandPayload());

            expect(sendWhatsAppMessage).not.toHaveBeenCalled();
        });

        // A reentrega do mesmo call_id (idempotência) não pode gerar uma segunda mensagem de
        // WhatsApp — nem "tentamos contato" nem "obrigado por conversar" duas vezes para o mesmo
        // lead a partir do mesmo evento de resultado.
        it('não dispara o fallback de WhatsApp na reentrega do mesmo call_id', async () => {
            noteFindFirst.mockResolvedValue({ id: 'nota-existente' });

            const res = await request(buildApp())
                .post('/api/webhooks/voice-result')
                .set(VALID_HEADERS)
                .send(blandPayload());

            expect(res.body.duplicate).toBe(true);
            expect(sendWhatsAppMessage).not.toHaveBeenCalled();
        });
    });
});
