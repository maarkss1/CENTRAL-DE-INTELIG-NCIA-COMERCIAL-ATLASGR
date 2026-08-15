import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHmac } from 'crypto';

/**
 * Webhook do Birth Voices Hub (/api/integrations/birth-voice/webhook, evento `agent.call.ended`) —
 * o caminho PRINCIPAL de resultado de ligação (não o legado /api/webhooks/voice-result, já coberto
 * em voiceResult.webhook.test.ts). Nunca teve suíte própria antes desta auditoria: só a lógica pura
 * de `birthVoice.helpers.ts` (assinatura, detecção de opt-out) era testada, não o handler HTTP nem
 * `recordCallResult` (idempotência, tenant, estado honesto, fallback WhatsApp).
 */

const leadFindFirst = vi.fn();
const activityFindFirst = vi.fn();
const activityCreate = vi.fn().mockResolvedValue({});
const timelineCreate = vi.fn().mockResolvedValue({});
const leadUpdate = vi.fn().mockResolvedValue({});
const recordOptOutMock = vi.fn().mockResolvedValue(true);
const sendWhatsAppMessageMock = vi.fn().mockResolvedValue(undefined);
const contextRuns: Array<Record<string, unknown>> = [];

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        lead: {
            findFirst: (...args: unknown[]) => leadFindFirst(...args),
            update: (...args: unknown[]) => leadUpdate(...args),
        },
        activity: {
            findFirst: (...args: unknown[]) => activityFindFirst(...args),
            create: (...args: unknown[]) => activityCreate(...args),
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

vi.mock('../../../../../src/features/integrations/birth-voice/callSuppression.service.js', () => ({
    recordOptOut: (...args: unknown[]) => recordOptOutMock(...args),
}));

vi.mock('../../../../../src/features/integrations/whatsapp/whatsapp.service.js', () => ({
    sendWhatsAppMessage: (...args: unknown[]) => sendWhatsAppMessageMock(...args),
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockEnv: Record<string, string | undefined> = { BIRTH_VOICES_WEBHOOK_SECRET: 'segredo-hub-teste' };
vi.mock('../../../../../src/config/env.js', () => ({ env: mockEnv }));

const { birthVoiceWebhookRoutes } = await import('../../../../../src/features/integrations/birth-voice/birthVoice.webhook');

function buildApp() {
    const app = express();
    app.use('/api/integrations/birth-voice', birthVoiceWebhookRoutes);
    return app;
}

function sign(body: string, secret = 'segredo-hub-teste'): string {
    return createHmac('sha256', body ? secret : secret).update(body).digest('hex');
}

function endedEvent(overrides: Record<string, unknown> = {}) {
    return {
        type: 'agent.call.ended',
        data: {
            callSid: 'CA-123',
            outcome: 'Concluído',
            durationSeconds: 62,
            agentName: 'Lea',
            transcript: [
                { role: 'assistant', content: 'Bom dia, falo da Atlas.' },
                { role: 'user', content: 'Pode falar, tudo bem.' },
            ],
            context: { organizationId: 'org-1', leadId: 'lead-1' },
            ...overrides,
        },
    };
}

const leadFixture = {
    id: 'lead-1',
    owner: 'Ana',
    customFields: {},
    contact: { whatsapp: null, phone: '+5511988776655' },
    company: { phones: [] },
};

beforeEach(() => {
    mockEnv.BIRTH_VOICES_WEBHOOK_SECRET = 'segredo-hub-teste';
    leadFindFirst.mockResolvedValue(leadFixture);
    activityFindFirst.mockResolvedValue(null);
});

afterEach(() => {
    vi.clearAllMocks();
    contextRuns.length = 0;
});

describe('POST /api/integrations/birth-voice/webhook', () => {
    it('responde 503 (fail-closed) quando BIRTH_VOICES_WEBHOOK_SECRET não está configurado', async () => {
        mockEnv.BIRTH_VOICES_WEBHOOK_SECRET = undefined;
        const body = JSON.stringify(endedEvent());

        const res = await request(buildApp())
            .post('/api/integrations/birth-voice/webhook')
            .set('x-birthvoices-signature', sign(body))
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(503);
        expect(leadFindFirst).not.toHaveBeenCalled();
    });

    it('responde 401 sem assinatura, sem tocar o banco', async () => {
        const body = JSON.stringify(endedEvent());

        const res = await request(buildApp())
            .post('/api/integrations/birth-voice/webhook')
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(401);
        expect(leadFindFirst).not.toHaveBeenCalled();
    });

    it('responde 401 com assinatura de outro segredo', async () => {
        const body = JSON.stringify(endedEvent());

        const res = await request(buildApp())
            .post('/api/integrations/birth-voice/webhook')
            .set('x-birthvoices-signature', sign(body, 'outro-segredo'))
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(401);
        expect(leadFindFirst).not.toHaveBeenCalled();
    });

    it('responde 400 quando o corpo assinado não é JSON válido', async () => {
        const body = '{not-json';

        const res = await request(buildApp())
            .post('/api/integrations/birth-voice/webhook')
            .set('x-birthvoices-signature', sign(body))
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(400);
        expect(leadFindFirst).not.toHaveBeenCalled();
    });

    it('ignora eventos que não são agent.call.ended, sem erro (evita reentrega em fila morta)', async () => {
        const body = JSON.stringify({ type: 'agent.call.started', data: {} });

        const res = await request(buildApp())
            .post('/api/integrations/birth-voice/webhook')
            .set('x-birthvoices-signature', sign(body))
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, ignored: 'agent.call.started' });
        expect(leadFindFirst).not.toHaveBeenCalled();
    });

    it('ignora silenciosamente quando falta organizationId/leadId no contexto', async () => {
        const body = JSON.stringify(endedEvent({ context: {} }));

        const res = await request(buildApp())
            .post('/api/integrations/birth-voice/webhook')
            .set('x-birthvoices-signature', sign(body))
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, ignored: 'sem contexto de lead' });
        expect(leadFindFirst).not.toHaveBeenCalled();
    });

    it('registra a atividade dentro do contexto de tenant correto', async () => {
        const body = JSON.stringify(endedEvent());

        const res = await request(buildApp())
            .post('/api/integrations/birth-voice/webhook')
            .set('x-birthvoices-signature', sign(body))
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, outcome: 'recorded' });
        expect(contextRuns).toContainEqual({ tenantId: 'org-1' });
        expect(activityCreate).toHaveBeenCalledTimes(1);
        expect(timelineCreate).toHaveBeenCalledTimes(1);
        expect(leadUpdate).toHaveBeenCalledWith({ where: { id: 'lead-1' }, data: { lastInteraction: expect.any(Date) } });
    });

    it('é idempotente: reentrega do mesmo callSid não duplica atividade nem timeline', async () => {
        activityFindFirst.mockResolvedValue({ id: 'activity-existente' });
        const body = JSON.stringify(endedEvent());

        const res = await request(buildApp())
            .post('/api/integrations/birth-voice/webhook')
            .set('x-birthvoices-signature', sign(body))
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, outcome: 'duplicate' });
        expect(activityCreate).not.toHaveBeenCalled();
        expect(timelineCreate).not.toHaveBeenCalled();
        expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    });

    it('não vaza para outro tenant: lead não encontrado no contexto devolve lead-not-found', async () => {
        leadFindFirst.mockResolvedValue(null);
        const body = JSON.stringify(endedEvent());

        const res = await request(buildApp())
            .post('/api/integrations/birth-voice/webhook')
            .set('x-birthvoices-signature', sign(body))
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, outcome: 'lead-not-found' });
        expect(activityCreate).not.toHaveBeenCalled();
    });

    it('responde 500 quando a escrita falha, para o Hub reentregar com backoff', async () => {
        activityCreate.mockRejectedValueOnce(new Error('db down'));
        const body = JSON.stringify(endedEvent());

        const res = await request(buildApp())
            .post('/api/integrations/birth-voice/webhook')
            .set('x-birthvoices-signature', sign(body))
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
    });

    describe('estado honesto do resultado (mapa provedor → Activity.status)', () => {
        it.each([
            ['Concluído', 62, 'Concluida'],
            ['Ocupado', 0, 'Cancelada'],
            ['Não atendida', 0, 'Cancelada'],
            ['Falha', 0, 'Cancelada'],
            ['Cancelada', 0, 'Cancelada'],
        ])('outcome do provedor "%s" (duração %ss) vira Activity.status "%s"', async (providerOutcome, duration, expectedStatus) => {
            const body = JSON.stringify(endedEvent({ outcome: providerOutcome, durationSeconds: duration, transcript: [] }));

            await request(buildApp())
                .post('/api/integrations/birth-voice/webhook')
                .set('x-birthvoices-signature', sign(body))
                .set('Content-Type', 'application/json')
                .send(body);

            expect(activityCreate).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ status: expectedStatus }) }),
            );
        });

        // O caso mais perigoso: o provedor diz "Concluído" (do ponto de vista telefônico, a chamada
        // terminou normalmente), mas quem atendeu foi a caixa postal — nunca pode virar "Concluida".
        it('secretária eletrônica detectada pelo texto nunca vira Concluida, mesmo com outcome "Concluído"', async () => {
            const body = JSON.stringify(endedEvent({
                outcome: 'Concluído',
                durationSeconds: 12,
                transcript: [{ role: 'user', content: 'Você atingiu a caixa postal, deixe seu recado após o sinal.' }],
            }));

            await request(buildApp())
                .post('/api/integrations/birth-voice/webhook')
                .set('x-birthvoices-signature', sign(body))
                .set('Content-Type', 'application/json')
                .send(body);

            expect(activityCreate).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ status: 'Cancelada' }) }),
            );
        });
    });

    describe('fallback WhatsApp', () => {
        it('dispara o fallback quando a ligação não resultou em conversa', async () => {
            const body = JSON.stringify(endedEvent({ outcome: 'Não atendida', durationSeconds: 0, transcript: [] }));

            await request(buildApp())
                .post('/api/integrations/birth-voice/webhook')
                .set('x-birthvoices-signature', sign(body))
                .set('Content-Type', 'application/json')
                .send(body);

            expect(sendWhatsAppMessageMock).toHaveBeenCalledWith(
                'org-1',
                '+5511988776655',
                expect.stringContaining('não conseguimos falar'),
            );
        });

        it('não dispara o fallback quando a ligação teve conversa real', async () => {
            const body = JSON.stringify(endedEvent());

            await request(buildApp())
                .post('/api/integrations/birth-voice/webhook')
                .set('x-birthvoices-signature', sign(body))
                .set('Content-Type', 'application/json')
                .send(body);

            expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
        });

        it('respeita optOutWhatsApp — nunca dispara fallback para quem pediu para sair do WhatsApp', async () => {
            leadFindFirst.mockResolvedValue({ ...leadFixture, customFields: { optOutWhatsApp: true } });
            const body = JSON.stringify(endedEvent({ outcome: 'Não atendida', durationSeconds: 0, transcript: [] }));

            await request(buildApp())
                .post('/api/integrations/birth-voice/webhook')
                .set('x-birthvoices-signature', sign(body))
                .set('Content-Type', 'application/json')
                .send(body);

            expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
        });

        it('nunca dispara duas vezes na reentrega do mesmo evento (idempotência cobre o fallback também)', async () => {
            activityFindFirst.mockResolvedValue({ id: 'activity-existente' });
            const body = JSON.stringify(endedEvent({ outcome: 'Não atendida', durationSeconds: 0, transcript: [] }));

            await request(buildApp())
                .post('/api/integrations/birth-voice/webhook')
                .set('x-birthvoices-signature', sign(body))
                .set('Content-Type', 'application/json')
                .send(body);

            expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
        });
    });

    describe('opt-out detectado na transcrição', () => {
        it('registra o bloqueio quando o lead pede para não ligar mais', async () => {
            const body = JSON.stringify(endedEvent({
                outcome: 'Concluído',
                transcript: [{ role: 'user', content: 'Não me ligue mais, por favor.' }],
            }));

            await request(buildApp())
                .post('/api/integrations/birth-voice/webhook')
                .set('x-birthvoices-signature', sign(body))
                .set('Content-Type', 'application/json')
                .send(body);

            expect(recordOptOutMock).toHaveBeenCalledWith(expect.objectContaining({
                organizationId: 'org-1',
                leadId: 'lead-1',
                source: 'call-opt-out',
            }));
        });

        // Opt-out de voz não deve gerar, no mesmo instante, uma mensagem de WhatsApp pedindo outro
        // horário — o pedido explícito do lead é para não ser mais contatado, não só por voz. Usa um
        // outcome que também NÃO teria conversa real (para isolar que quem barra o fallback aqui é
        // o próprio opt-out, não só a regra de "sem conversa").
        it('não dispara o fallback de WhatsApp quando a ligação terminou em opt-out', async () => {
            const body = JSON.stringify(endedEvent({
                outcome: 'Falha',
                transcript: [{ role: 'user', content: 'Não me ligue mais, por favor.' }],
            }));

            await request(buildApp())
                .post('/api/integrations/birth-voice/webhook')
                .set('x-birthvoices-signature', sign(body))
                .set('Content-Type', 'application/json')
                .send(body);

            expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
        });
    });
});
