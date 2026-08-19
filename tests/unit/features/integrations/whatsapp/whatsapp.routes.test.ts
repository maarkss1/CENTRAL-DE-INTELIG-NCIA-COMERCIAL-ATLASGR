import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const enqueueWhatsAppCommandMock = vi.fn().mockResolvedValue({ jobId: 'job-1', correlationId: 'corr-1' });

vi.mock('@/lib/queue/whatsappCommand.queue', () => ({
    enqueueWhatsAppCommand: (...args: unknown[]) => enqueueWhatsAppCommandMock(...args),
}));

vi.mock('@/features/integrations/whatsapp/whatsapp.service', () => ({
    getWhatsAppStatus: vi.fn(),
}));

vi.mock('@/features/integrations/whatsapp/whatsappMessage.service', () => ({
    listConversations: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {},
}));

import { whatsappRoutes } from '@/features/integrations/whatsapp/whatsapp.routes';
import { errorHandler } from '@/shared/middlewares/errorHandler';

function buildApp(role = 'CLOSER') {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: { id: string; organizationId: string; role: string } }).user = {
            id: 'test-user',
            organizationId: 'test-org-id',
            role,
        };
        next();
    });
    app.use('/api/whatsapp', whatsappRoutes);
    app.use(errorHandler);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
    enqueueWhatsAppCommandMock.mockResolvedValue({ jobId: 'job-1', correlationId: 'corr-1' });
});

// CYC-001 (Sprint 06/Onda 18): POST /api/whatsapp/send passava `context: { skipOptOutCheck: true }`
// sem nenhuma justificativa — era o único caller de produção desse flag em todo o repositório,
// permitindo enviar WhatsApp manual a um lead que já tinha pedido opt-out. Este teste trava a
// regressão: o comando enfileirado a partir desta rota nunca deve carregar skipOptOutCheck.
describe('POST /api/whatsapp/send — opt-out gating (CYC-001/onda-18)', () => {
    it('enfileira o comando sem context.skipOptOutCheck — checagem de opt-out roda normalmente no worker', async () => {
        const res = await request(buildApp())
            .post('/api/whatsapp/send')
            .send({ number: '11999998888', text: 'Olá' });

        expect(res.status).toBe(202);
        expect(enqueueWhatsAppCommandMock).toHaveBeenCalledTimes(1);
        const [command] = enqueueWhatsAppCommandMock.mock.calls[0];
        expect(command).toMatchObject({ type: 'send', number: '11999998888', text: 'Olá' });
        expect(command.context?.skipOptOutCheck).not.toBe(true);
        expect(command).not.toHaveProperty('context.skipOptOutCheck', true);
    });

    it('400 quando number/text estão ausentes, sem enfileirar nada', async () => {
        const res = await request(buildApp()).post('/api/whatsapp/send').send({});

        expect(res.status).toBe(400);
        expect(enqueueWhatsAppCommandMock).not.toHaveBeenCalled();
    });
});
