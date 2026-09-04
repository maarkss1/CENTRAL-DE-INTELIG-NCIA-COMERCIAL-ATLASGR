import { OAuth2Client } from 'google-auth-library';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../../config/env.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { fetchWithTimeout, withTimeout } from '../../../lib/http.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';

/** Mesmo teto usado nas chamadas REST diretas (fetchWithTimeout) — google-auth-library não expõe
 * timeout próprio para getToken()/refreshAccessToken(), então sem isto uma travada no endpoint de
 * token do Google prende a requisição indefinidamente. */
const OAUTH_TOKEN_TIMEOUT_MS = 15_000;

/** GOOGLE_CLIENT_ID/SECRET ou PUBLIC_BASE_URL ausentes — sem eles não há como montar o fluxo OAuth. */
export class GoogleNotConfiguredError extends Error {}

/** A organização ainda não conectou uma conta Google Workspace. */
export class GoogleNotConnectedError extends Error {}

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'openid',
  'email',
];

/**
 * Redirect URI desta integração — DIFERENTE do usado pelo login "Entrar com Google" (esse é
 * gerenciado pelo better-auth em /api/auth/callback/google). Esta é uma concessão separada, com
 * escopos de dados (Gmail/Calendar), não de autenticação — precisa ser cadastrada à parte no
 * mesmo Client OAuth do Google Cloud Console.
 */
function redirectUri(): string {
  if (!env.PUBLIC_BASE_URL) {
    throw new GoogleNotConfiguredError(
      'PUBLIC_BASE_URL ausente — necessário para montar o redirect_uri do Google.',
    );
  }
  return `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/google/callback`;
}

function createOAuthClient(): OAuth2Client {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleNotConfiguredError('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ausentes.');
  }
  return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri());
}

/**
 * Assina um `state` sem estado (sem precisar de Redis/sessão): o próprio valor carrega o
 * organizationId e uma prova HMAC de que veio de nós, não de um callback forjado por outra
 * origem. `authenticateToken` já exige sessão válida no callback — isto é defesa adicional.
 */
function signState(organizationId: string): string {
  if (!env.BETTER_AUTH_SECRET) {
    throw new GoogleNotConfiguredError(
      'BETTER_AUTH_SECRET ausente — necessário para assinar o state do OAuth.',
    );
  }
  const nonce = Date.now().toString(36);
  const payload = `${organizationId}.${nonce}`;
  const signature = createHmac('sha256', env.BETTER_AUTH_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`, 'utf8').toString('base64url');
}

/** Verifica o `state` devolvido pelo Google e devolve o organizationId nele, ou null se inválido. */
export function verifyState(state: string, expectedOrganizationId: string): boolean {
  if (!env.BETTER_AUTH_SECRET) return false;
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const [organizationId, nonce, signature] = decoded.split('.');
    if (!organizationId || !nonce || !signature) return false;
    if (organizationId !== expectedOrganizationId) return false;

    const expected = createHmac('sha256', env.BETTER_AUTH_SECRET)
      .update(`${organizationId}.${nonce}`)
      .digest('hex');
    const receivedBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    return receivedBuf.length === expectedBuf.length && timingSafeEqual(receivedBuf, expectedBuf);
  } catch {
    return false;
  }
}

/** URL real de consentimento OAuth do Google — `state` prova que o callback corresponde a este pedido. */
export function getGoogleAuthUrl(organizationId: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    // Sem isto, uma reconexão nunca devolveria um refresh_token novo (o Google só manda o
    // refresh_token na PRIMEIRA autorização de um usuário para um client, a menos que force).
    prompt: 'consent',
    scope: SCOPES,
    state: signState(organizationId),
  });
}

async function fetchConnectedEmail(accessToken: string): Promise<string> {
  const response = await fetchWithTimeout(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    15_000,
    ['www.googleapis.com'],
  );
  if (!response.ok) {
    // AppError (não Error genérico): sem isso, o errorHandler global substitui a mensagem por
    // "Erro Interno do Servidor" em produção — o operador não consegue distinguir uma falha
    // real do Google de qualquer outro 500 (ver errorHandler.ts).
    throw new AppError(
      `Falha ao obter e-mail da conta Google conectada (HTTP ${response.status}).`,
      502,
    );
  }
  const data = (await response.json()) as { email?: string };
  if (!data.email) {
    throw new AppError('Resposta do Google não trouxe um e-mail.', 502);
  }
  return data.email;
}

/** Troca o código de autorização por tokens reais e persiste a conexão desta organização. */
export async function processGoogleCallback(
  organizationId: string,
  code: string,
): Promise<{ email: string }> {
  const client = createOAuthClient();
  // `.catch` (em vez de try/catch em volta de uma `let` pré-tipada) deixa o TypeScript inferir o
  // tipo de sucesso (GetTokenResponse) direto da chamada real — evita o ReturnType<> de um
  // método sobrecarregado (getToken tem overloads) resolver pro tipo errado.
  const { tokens } = await withTimeout(client.getToken(code), OAUTH_TOKEN_TIMEOUT_MS).catch(
    (err) => {
      logger.warn(
        { err, organizationId },
        '[google] Falha/timeout ao trocar o código de autorização por tokens',
      );
      throw new AppError(
        'Não foi possível concluir a conexão com o Google agora (timeout ou falha de comunicação).',
        502,
      );
    },
  );

  if (!tokens.access_token || !tokens.refresh_token) {
    // O Google só devolve refresh_token na primeira concessão de consentimento — se a
    // organização reconectar sem revogar o acesso antes, prompt:'consent' acima ainda força
    // um novo, mas cobrimos o caso de faltar mesmo assim em vez de salvar uma conexão inútil.
    throw new AppError(
      'Google não devolveu um refresh_token. Revogue o acesso em myaccount.google.com e tente conectar de novo.',
      502,
    );
  }

  const email = await fetchConnectedEmail(tokens.access_token);

  await prisma.googleWorkspaceConnection.upsert({
    where: { organizationId },
    create: {
      organizationId,
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope || SCOPES.join(' '),
      expiresAt: new Date(tokens.expiry_date || Date.now() + 3600_000),
    },
    update: {
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope || SCOPES.join(' '),
      expiresAt: new Date(tokens.expiry_date || Date.now() + 3600_000),
    },
  });

  return { email };
}

export async function getGoogleStatus(
  organizationId: string,
): Promise<{ connected: boolean; email: string | null; hasCalendarWriteScope: boolean }> {
  const connection = await prisma.googleWorkspaceConnection.findUnique({
    where: { organizationId },
    select: { email: true, scope: true },
  });
  return {
    connected: !!connection,
    email: connection?.email ?? null,
    // Escopo `calendar.events` só existe em conexões feitas (ou reconectadas) depois da mudança
    // de escopo do CYC-004 — uma organização conectada antes disso ainda tem só
    // `calendar.readonly` até reconectar (o Google não amplia escopo de um token já emitido),
    // e a escrita real via Cadência falharia (403) silenciosamente sem este sinal.
    hasCalendarWriteScope: !!connection?.scope?.includes('calendar.events'),
  };
}

export async function disconnectGoogle(organizationId: string): Promise<void> {
  await prisma.googleWorkspaceConnection.deleteMany({ where: { organizationId } });
}

/**
 * Access token válido para chamar as APIs do Google em nome desta organização — renova via
 * refresh_token quando o access_token salvo já expirou (ou expira nos próximos 60s).
 */
async function getValidAccessToken(organizationId: string, forceRefresh = false): Promise<string> {
  const connection = await prisma.googleWorkspaceConnection.findUnique({
    where: { organizationId },
  });
  if (!connection) {
    throw new GoogleNotConnectedError('Esta organização ainda não conectou uma conta Google.');
  }

  if (!forceRefresh && connection.expiresAt.getTime() > Date.now() + 60_000) {
    return connection.accessToken;
  }

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: connection.refreshToken });
  const { credentials } = await withTimeout(
    client.refreshAccessToken(),
    OAUTH_TOKEN_TIMEOUT_MS,
  ).catch((err) => {
    logger.warn({ err, organizationId }, '[google] Falha/timeout ao renovar o access_token');
    throw new AppError(
      'Não foi possível renovar a conexão com o Google agora (timeout ou falha de comunicação).',
      502,
    );
  });
  if (!credentials.access_token) {
    throw new AppError(
      'Falha ao renovar o access_token do Google (refresh_token pode ter sido revogado).',
      409,
    );
  }

  await prisma.googleWorkspaceConnection.update({
    where: { organizationId },
    data: {
      accessToken: credentials.access_token,
      expiresAt: new Date(credentials.expiry_date || Date.now() + 3600_000),
      // O Google às vezes reemite um refresh_token novo na renovação; guarda quando vier.
      ...(credentials.refresh_token ? { refreshToken: credentials.refresh_token } : {}),
    },
  });

  return credentials.access_token;
}

export interface UpcomingCalendarEvent {
  id: string;
  summary: string;
  start: string | null;
  end: string | null;
}

/** Próximos eventos reais do Google Calendar da conta conectada — prova de que a integração funciona de verdade. */
export async function getUpcomingCalendarEvents(
  organizationId: string,
  maxResults = 5,
): Promise<UpcomingCalendarEvent[]> {
  let accessToken = await getValidAccessToken(organizationId);

  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
  });
  let response = await fetchWithTimeout(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    15_000,
    ['www.googleapis.com'],
  );

  if (response.status === 401) {
    logger.warn({ organizationId }, 'Google Calendar retornou 401 — forçando renovação de token');
    accessToken = await getValidAccessToken(organizationId, true);
    response = await fetchWithTimeout(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      15_000,
      ['www.googleapis.com'],
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error(
      { status: response.status, body, organizationId },
      'Falha ao buscar eventos do Google Calendar.',
    );
    throw new AppError(`Falha ao consultar o Google Calendar (HTTP ${response.status}).`, 502);
  }

  const data = (await response.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>;
  };
  return (data.items || []).map((item) => ({
    id: item.id,
    summary: item.summary || '(Sem título)',
    start: item.start?.dateTime || item.start?.date || null,
    end: item.end?.dateTime || item.end?.date || null,
  }));
}

export interface CreateCalendarEventInput {
  summary: string;
  start: Date;
  end: Date;
  attendees?: string[];
}

/** Cria um evento no calendário primário e retorna o ID do evento criado no Google. */
export async function createCalendarEvent(
  organizationId: string,
  input: CreateCalendarEventInput,
): Promise<string> {
  let accessToken = await getValidAccessToken(organizationId);

  const eventPayload = {
    summary: input.summary,
    start: { dateTime: input.start.toISOString() },
    end: { dateTime: input.end.toISOString() },
    attendees: input.attendees ? input.attendees.map((email) => ({ email })) : undefined,
  };

  let response = await fetchWithTimeout(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventPayload),
    },
    15_000,
    ['www.googleapis.com'],
  );

  if (response.status === 401) {
    logger.warn(
      { organizationId },
      'Google Calendar retornou 401 ao criar evento — forçando renovação de token',
    );
    accessToken = await getValidAccessToken(organizationId, true);
    response = await fetchWithTimeout(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventPayload),
      },
      15_000,
      ['www.googleapis.com'],
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error(
      { status: response.status, body, organizationId },
      'Falha ao criar evento no Google Calendar.',
    );
    throw new AppError(`Falha ao criar evento no Google Calendar (HTTP ${response.status}).`, 502);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}
