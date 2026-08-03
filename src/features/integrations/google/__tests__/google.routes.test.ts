/**
 * Cobre a rota /api/google (google.routes.ts) — contrato HTTP dos endpoints auth-url, callback,
 * status, disconnect e calendar/upcoming.
 *
 * NOTA IMPORTANTE: `google.service.ts` já é uma implementação REAL de OAuth (google-auth-library +
 * Prisma + chamadas HTTP reais ao Google), não mock — ver src/features/integrations/google/__tests__/
 * google.service.test.ts, que cobre o contrato da camada de serviço com 12 testes passando. O item
 * BACK-005 do inventário de dívida técnica (docs/auditoria-divida-tecnica/03-MATRIZ-DIVIDA-TECNICA.md),
 * que descrevia essa integração como "inteiramente mockada", está desatualizado em relação ao código
 * atual e deveria ser revisto/fechado separadamente.
 *
 * Este arquivo mocka `google.service.ts` (a camada de serviço já tem seus próprios testes reais) e
 * foca só no contrato do router Express: shape da resposta, códigos de status e como cada erro do
 * serviço é traduzido em resposta HTTP.
 *
 * `authenticateToken` (src/shared/middlewares/authenticateToken.ts) NÃO faz parte deste router — é
 * aplicado em server.ts ao montar `/api/google` (`app.use('/api/google', authenticateToken,
 * requireTenant, googleRoutes)`), seguindo o mesmo padrão dos demais testes de rota deste projeto
 * (ex.: company.routes.test.ts, usage.routes.test.ts), que também injetam `req.user` diretamente em
 * vez de exercitar o middleware de auth real. O teste "sem usuário autenticado" abaixo documenta essa
 * dependência: sem `req.user` (isto é, sem o router estar montado atrás de `authenticateToken`), os
 * handlers quebram ao desestruturar `req.user` e a requisição cai no errorHandler global como 500 —
 * é o `authenticateToken` upstream que impede isso de acontecer em produção.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '@/shared/middlewares/errorHandler';

const getGoogleAuthUrlMock = vi.fn();
const processGoogleCallbackMock = vi.fn();
const getGoogleStatusMock = vi.fn();
const disconnectGoogleMock = vi.fn();
const getUpcomingCalendarEventsMock = vi.fn();
const verifyStateMock = vi.fn();

vi.mock('../google.service.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../google.service.js')>();
    return {
        ...actual,
        // Mantém as classes de erro reais (GoogleNotConfiguredError/GoogleNotConnectedError) —
        // o router faz `instanceof` contra elas, então precisam ser a mesma referência de classe.
        getGoogleAuthUrl: (...args: unknown[]) => getGoogleAuthUrlMock(...args),
        processGoogleCallback: (...args: unknown[]) => processGoogleCallbackMock(...args),
        getGoogleStatus: (...args: unknown[]) => getGoogleStatusMock(...args),
        disconnectGoogle: (...args: unknown[]) => disconnectGoogleMock(...args),
        getUpcomingCalendarEvents: (...args: unknown[]) => getUpcomingCalendarEventsMock(...args),
        verifyState: (...args: unknown[]) => verifyStateMock(...args),
    };
});

import { googleRoutes } from '../google.routes.js';
import { GoogleNotConfiguredError, GoogleNotConnectedError } from '../google.service.js';

function buildApp(withUser = true) {
    const app = express();
    app.use(express.json());
    if (withUser) {
        app.use((req, _res, next) => {
            (req as unknown as { user: { id: string; organizationId: string; role: string } }).user = {
                id: 'test-user',
                organizationId: 'org-1',
                role: 'ADMIN',
            };
            next();
        });
    }
    app.use('/api/google', googleRoutes);
    app.use(errorHandler);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/google/auth-url', () => {
    it('devolve a URL de consentimento gerada pelo serviço', async () => {
        getGoogleAuthUrlMock.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
        const app = buildApp();

        const res = await request(app).get('/api/google/auth-url');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?mock=1' } });
        expect(getGoogleAuthUrlMock).toHaveBeenCalledWith('org-1');
    });

    it('devolve 503 quando o serviço não está configurado (GOOGLE_CLIENT_ID/SECRET ausentes)', async () => {
        getGoogleAuthUrlMock.mockImplementation(() => {
            throw new GoogleNotConfiguredError('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ausentes.');
        });
        const app = buildApp();

        const res = await request(app).get('/api/google/auth-url');

        expect(res.status).toBe(503);
        expect(res.body).toEqual({ success: false, error: 'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ausentes.' });
    });

    it('propaga erro inesperado pro errorHandler global (500)', async () => {
        getGoogleAuthUrlMock.mockImplementation(() => {
            throw new Error('boom');
        });
        const app = buildApp();

        const res = await request(app).get('/api/google/auth-url');

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
    });
});

describe('GET /api/google/callback', () => {
    it('redireciona com erro quando faltam code/state', async () => {
        const app = buildApp();

        const res = await request(app).get('/api/google/callback');

        expect(res.status).toBe(302);
        const location = new URL(res.headers.location, 'https://app.example');
        expect(location.searchParams.get('google')).toBe('error');
        expect(location.searchParams.get('message')).toBe('Parâmetros ausentes no retorno do Google.');
        expect(processGoogleCallbackMock).not.toHaveBeenCalled();
    });

    it('redireciona com erro quando o state é inválido', async () => {
        verifyStateMock.mockReturnValue(false);
        const app = buildApp();

        const res = await request(app).get('/api/google/callback').query({ code: 'c1', state: 's1' });

        expect(res.status).toBe(302);
        const location = new URL(res.headers.location, 'https://app.example');
        expect(location.searchParams.get('google')).toBe('error');
        expect(processGoogleCallbackMock).not.toHaveBeenCalled();
    });

    it('processa o callback e redireciona com sucesso quando o state é válido', async () => {
        verifyStateMock.mockReturnValue(true);
        processGoogleCallbackMock.mockResolvedValue({ email: 'comercial@atlasgr.com.br' });
        const app = buildApp();

        const res = await request(app).get('/api/google/callback').query({ code: 'c1', state: 's1' });

        expect(res.status).toBe(302);
        const location = new URL(res.headers.location, 'https://app.example');
        expect(location.searchParams.get('google')).toBe('connected');
        expect(processGoogleCallbackMock).toHaveBeenCalledWith('org-1', 'c1');
    });

    it('redireciona com erro quando processGoogleCallback rejeita', async () => {
        verifyStateMock.mockReturnValue(true);
        processGoogleCallbackMock.mockRejectedValue(new Error('Google não devolveu um refresh_token.'));
        const app = buildApp();

        const res = await request(app).get('/api/google/callback').query({ code: 'c1', state: 's1' });

        expect(res.status).toBe(302);
        const location = new URL(res.headers.location, 'https://app.example');
        expect(location.searchParams.get('google')).toBe('error');
        expect(location.searchParams.get('message')).toBe('Google não devolveu um refresh_token.');
    });
});

describe('GET /api/google/status', () => {
    it('devolve o shape { connected, email } do serviço', async () => {
        getGoogleStatusMock.mockResolvedValue({ connected: true, email: 'comercial@atlasgr.com.br' });
        const app = buildApp();

        const res = await request(app).get('/api/google/status');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: { connected: true, email: 'comercial@atlasgr.com.br' } });
        expect(getGoogleStatusMock).toHaveBeenCalledWith('org-1');
    });
});

describe('POST /api/google/disconnect', () => {
    it('desconecta e devolve { success: true }', async () => {
        disconnectGoogleMock.mockResolvedValue(undefined);
        const app = buildApp();

        const res = await request(app).post('/api/google/disconnect');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true });
        expect(disconnectGoogleMock).toHaveBeenCalledWith('org-1');
    });
});

describe('GET /api/google/calendar/upcoming', () => {
    it('devolve a lista de eventos do serviço', async () => {
        const events = [{ id: 'ev1', summary: 'Reunião', start: '2026-08-03T10:00:00Z', end: null }];
        getUpcomingCalendarEventsMock.mockResolvedValue(events);
        const app = buildApp();

        const res = await request(app).get('/api/google/calendar/upcoming');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: events });
        expect(getUpcomingCalendarEventsMock).toHaveBeenCalledWith('org-1');
    });

    it('devolve 409 quando a organização ainda não conectou o Google', async () => {
        getUpcomingCalendarEventsMock.mockRejectedValue(new GoogleNotConnectedError('Esta organização ainda não conectou uma conta Google.'));
        const app = buildApp();

        const res = await request(app).get('/api/google/calendar/upcoming');

        expect(res.status).toBe(409);
        expect(res.body).toEqual({ success: false, error: 'Esta organização ainda não conectou uma conta Google.' });
    });
});

describe('autenticação', () => {
    it('sem req.user (ou seja, sem o router montado atrás de authenticateToken) a requisição falha via errorHandler', async () => {
        const app = buildApp(false);

        const res = await request(app).get('/api/google/status');

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(getGoogleStatusMock).not.toHaveBeenCalled();
    });
});
