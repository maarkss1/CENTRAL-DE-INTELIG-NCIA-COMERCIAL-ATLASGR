import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateAuthUrlMock = vi.fn((_opts: { state: string }) => 'https://accounts.google.com/o/oauth2/v2/auth?mock=1');
const getTokenMock = vi.fn();
const setCredentialsMock = vi.fn();
const refreshAccessTokenMock = vi.fn();

vi.mock('google-auth-library', () => {
    class MockOAuth2Client {
        generateAuthUrl = generateAuthUrlMock;
        getToken = getTokenMock;
        setCredentials = setCredentialsMock;
        refreshAccessToken = refreshAccessTokenMock;
    }
    return { OAuth2Client: MockOAuth2Client };
});

let mockedEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({
    get env() {
        return mockedEnv;
    },
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        googleWorkspaceConnection: {
            upsert: vi.fn(),
            findUnique: vi.fn(),
            deleteMany: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const CONFIGURED_ENV = {
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    PUBLIC_BASE_URL: 'https://app.atlasgr.com.br',
    BETTER_AUTH_SECRET: 'segredo-de-teste',
};

const ORG = 'org-1';

beforeEach(() => {
    vi.clearAllMocks();
    mockedEnv = { ...CONFIGURED_ENV };
});

describe('getGoogleAuthUrl / verifyState', () => {
    it('lança GoogleNotConfiguredError sem GOOGLE_CLIENT_ID/SECRET', async () => {
        mockedEnv = { PUBLIC_BASE_URL: 'https://app.atlasgr.com.br', BETTER_AUTH_SECRET: 'x' };
        const { getGoogleAuthUrl, GoogleNotConfiguredError } = await import('../google.service.js');

        expect(() => getGoogleAuthUrl(ORG)).toThrow(GoogleNotConfiguredError);
    });

    it('lança GoogleNotConfiguredError sem PUBLIC_BASE_URL', async () => {
        mockedEnv = { GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', BETTER_AUTH_SECRET: 'x' };
        const { getGoogleAuthUrl, GoogleNotConfiguredError } = await import('../google.service.js');

        expect(() => getGoogleAuthUrl(ORG)).toThrow(GoogleNotConfiguredError);
    });

    it('gera a URL real com escopos de Gmail/Calendar e access_type offline', async () => {
        const { getGoogleAuthUrl } = await import('../google.service.js');

        const url = getGoogleAuthUrl(ORG);

        expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
        expect(generateAuthUrlMock).toHaveBeenCalledWith(expect.objectContaining({
            access_type: 'offline',
            prompt: 'consent',
            scope: expect.arrayContaining([
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/calendar.events',
                'openid',
                'email',
            ]),
        }));
    });

    it('o state assinado só é válido para o mesmo organizationId', async () => {
        const { getGoogleAuthUrl, verifyState } = await import('../google.service.js');
        getGoogleAuthUrl(ORG);
        const [[{ state }]] = generateAuthUrlMock.mock.calls.map((call) => call);

        expect(verifyState(state, ORG)).toBe(true);
        expect(verifyState(state, 'org-outro')).toBe(false);
    });

    it('rejeita um state adulterado', async () => {
        const { getGoogleAuthUrl, verifyState } = await import('../google.service.js');
        getGoogleAuthUrl(ORG);
        const [[{ state }]] = generateAuthUrlMock.mock.calls.map((call) => call);

        expect(verifyState(state + 'x', ORG)).toBe(false);
    });
});

describe('processGoogleCallback', () => {
    it('persiste a conexão e devolve o e-mail da conta conectada', async () => {
        getTokenMock.mockResolvedValue({
            tokens: { access_token: 'at-1', refresh_token: 'rt-1', scope: 'a b', expiry_date: Date.now() + 3600_000 },
        });
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ email: 'comercial@atlasgr.com.br' }), { status: 200 }),
        );
        const { prisma } = await import('@/lib/prisma');
        const { processGoogleCallback } = await import('../google.service.js');

        const result = await processGoogleCallback(ORG, 'auth-code');

        expect(result).toEqual({ email: 'comercial@atlasgr.com.br' });
        expect(prisma.googleWorkspaceConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { organizationId: ORG },
        }));
        fetchMock.mockRestore();
    });

    it('lança quando o Google não devolve refresh_token', async () => {
        getTokenMock.mockResolvedValue({ tokens: { access_token: 'at-1' } });
        const { processGoogleCallback } = await import('../google.service.js');

        await expect(processGoogleCallback(ORG, 'auth-code')).rejects.toThrow(/refresh_token/);
    });
});

describe('getGoogleStatus', () => {
    it('devolve connected=false quando não há conexão', async () => {
        const { prisma } = await import('@/lib/prisma');
        vi.mocked(prisma.googleWorkspaceConnection.findUnique).mockResolvedValue(null);
        const { getGoogleStatus } = await import('../google.service.js');

        expect(await getGoogleStatus(ORG)).toEqual({ connected: false, email: null });
    });

    it('devolve connected=true com o e-mail quando há conexão', async () => {
        const { prisma } = await import('@/lib/prisma');
        vi.mocked(prisma.googleWorkspaceConnection.findUnique).mockResolvedValue({ email: 'comercial@atlasgr.com.br' } as never);
        const { getGoogleStatus } = await import('../google.service.js');

        expect(await getGoogleStatus(ORG)).toEqual({ connected: true, email: 'comercial@atlasgr.com.br' });
    });
});

describe('getUpcomingCalendarEvents', () => {
    it('lança GoogleNotConnectedError quando a organização nunca conectou', async () => {
        const { prisma } = await import('@/lib/prisma');
        vi.mocked(prisma.googleWorkspaceConnection.findUnique).mockResolvedValue(null);
        const { getUpcomingCalendarEvents, GoogleNotConnectedError } = await import('../google.service.js');

        await expect(getUpcomingCalendarEvents(ORG)).rejects.toBeInstanceOf(GoogleNotConnectedError);
    });

    it('usa o access_token salvo quando ainda não expirou', async () => {
        const { prisma } = await import('@/lib/prisma');
        vi.mocked(prisma.googleWorkspaceConnection.findUnique).mockResolvedValue({
            accessToken: 'at-valid',
            refreshToken: 'rt-1',
            expiresAt: new Date(Date.now() + 3600_000),
        } as never);
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ items: [{ id: 'ev1', summary: 'Reunião', start: { dateTime: '2026-08-03T10:00:00Z' } }] }), { status: 200 }),
        );
        const { getUpcomingCalendarEvents } = await import('../google.service.js');

        const events = await getUpcomingCalendarEvents(ORG);

        expect(events).toEqual([{ id: 'ev1', summary: 'Reunião', start: '2026-08-03T10:00:00Z', end: null }]);
        expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ headers: { Authorization: 'Bearer at-valid' } }));
        expect(refreshAccessTokenMock).not.toHaveBeenCalled();
        fetchMock.mockRestore();
    });

    it('renova o access_token via refresh_token quando o salvo já expirou', async () => {
        const { prisma } = await import('@/lib/prisma');
        vi.mocked(prisma.googleWorkspaceConnection.findUnique).mockResolvedValue({
            accessToken: 'at-expirado',
            refreshToken: 'rt-1',
            expiresAt: new Date(Date.now() - 1000),
        } as never);
        refreshAccessTokenMock.mockResolvedValue({ credentials: { access_token: 'at-novo', expiry_date: Date.now() + 3600_000 } });
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ items: [] }), { status: 200 }),
        );
        const { getUpcomingCalendarEvents } = await import('../google.service.js');

        await getUpcomingCalendarEvents(ORG);

        expect(setCredentialsMock).toHaveBeenCalledWith({ refresh_token: 'rt-1' });
        expect(prisma.googleWorkspaceConnection.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ accessToken: 'at-novo' }),
        }));
        expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ headers: { Authorization: 'Bearer at-novo' } }));
        fetchMock.mockRestore();
    });
});
