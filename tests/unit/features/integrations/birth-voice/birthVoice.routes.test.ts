import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const recordOptOutMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
    prisma: {
        coldCallRun: { findMany: vi.fn().mockResolvedValue([]) },
    },
}));

vi.mock('@/features/integrations/birth-voice/birthVoice.service', () => ({
    callLead: vi.fn(),
    BirthVoiceNotConfiguredError: class BirthVoiceNotConfiguredError extends Error {},
    NoPhoneNumberError: class NoPhoneNumberError extends Error {},
    SuppressedNumberError: class SuppressedNumberError extends Error {},
}));

vi.mock('@/features/integrations/birth-voice/callSuppression.service', () => ({
    listSuppressions: vi.fn().mockResolvedValue([]),
    recordOptOut: (...args: unknown[]) => recordOptOutMock(...args),
    normalizeSuppressionKey: vi.fn().mockReturnValue('+5511999999999'),
}));

vi.mock('@/features/integrations/birth-voice/coldCall.service', () => ({
    enabledOrganizations: vi.fn().mockResolvedValue([]),
    callWindowFromEnv: vi.fn().mockReturnValue({}),
    dialPolicyFromEnv: vi.fn().mockReturnValue({}),
}));

import { birthVoiceRoutes } from '@/features/integrations/birth-voice/birthVoice.routes';
import { errorHandler } from '@/shared/middlewares/errorHandler';

function buildApp(role?: string) {
    const app = express();
    app.use(express.json());
    if (role) {
        app.use((req, _res, next) => {
            (req as unknown as { user: { id: string; organizationId: string; role: string } }).user = {
                id: 'test-user',
                organizationId: 'test-org-id',
                role,
            };
            next();
        });
    }
    app.use('/api/integrations/birth-voice', birthVoiceRoutes);
    app.use(errorHandler);
    return app;
}

const payload = {
    phone: '(11) 99999-9999',
    reason: 'Solicitou não receber novas ligações.',
    leadId: 'lead-1',
};

beforeEach(() => {
    vi.clearAllMocks();
    recordOptOutMock.mockResolvedValue(undefined);
});

describe('POST /api/integrations/birth-voice/suppressions — autorização de opt-out', () => {
    it.each(['ADMIN', 'GESTOR', 'CLOSER', 'SDR'])('%s pode registrar opt-out imediatamente', async (role) => {
        const response = await request(buildApp(role))
            .post('/api/integrations/birth-voice/suppressions')
            .send(payload);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(recordOptOutMock).toHaveBeenCalledWith({
            organizationId: 'test-org-id',
            phone: payload.phone,
            source: 'manual',
            reason: payload.reason,
            leadId: payload.leadId,
        });
    });

    it('VISUALIZADOR recebe 403 e não altera a lista de supressão', async () => {
        const response = await request(buildApp('VISUALIZADOR'))
            .post('/api/integrations/birth-voice/suppressions')
            .send(payload);

        expect(response.status).toBe(403);
        expect(recordOptOutMock).not.toHaveBeenCalled();
    });

    it('sem sessão autenticada recebe 401 e não altera a lista de supressão', async () => {
        const response = await request(buildApp())
            .post('/api/integrations/birth-voice/suppressions')
            .send(payload);

        expect(response.status).toBe(401);
        expect(recordOptOutMock).not.toHaveBeenCalled();
    });
});
