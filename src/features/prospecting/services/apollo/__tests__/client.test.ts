import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ACH-05-04 (auditoria 2026-09-11, agente 05): `client.ts` é o cliente HTTP genérico/base
// compartilhado por todos os módulos de `apollo/*` (constantes de URL, `checkApolloConnection` —
// health-check de configuração usado pela tela de Integrações — e `parsePlanRestriction`, o
// detector do erro de plano/escopo insuficiente que decide o fallback para Hunter em
// `people.ts`) e nunca teve teste dedicado. `checkApolloConnection` usa `fetchWithTimeout`
// (`src/lib/http.ts`) de verdade (não mockado) — só o `fetch` global é stubado — porque o próprio
// contrato de host-allowlist (`allowedHosts`) faz parte do que este teste garante.

const getPaidProspectingKeyMock = vi.fn();
vi.mock('@/config/prospecting-integrations.js', () => ({
  getPaidProspectingKey: (...args: unknown[]) => getPaidProspectingKeyMock(...args),
}));

import {
  checkApolloConnection,
  parsePlanRestriction,
  APOLLO_PLAN_RESTRICTED_CODE,
} from '@/features/prospecting/services/apollo/client';

beforeEach(() => {
  getPaidProspectingKeyMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('checkApolloConnection', () => {
  it('sem APOLLO_API_KEY configurada, não chama a rede e reporta fallback para Hunter', async () => {
    getPaidProspectingKeyMock.mockReturnValue(undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkApolloConnection();

    expect(result).toEqual({
      connected: false,
      configured: false,
      providerMode: 'hunter',
      message: expect.stringContaining('APOLLO_API_KEY não configurada'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('chave configurada e health-check OK: connected true, providerMode apollo', async () => {
    getPaidProspectingKeyMock.mockReturnValue('fake-apollo-key');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkApolloConnection();

    expect(result).toEqual({ connected: true, configured: true, providerMode: 'apollo' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('api.apollo.io');
    expect((init as RequestInit).headers).toMatchObject({ 'X-Api-Key': 'fake-apollo-key' });
  });

  it('chave configurada mas inválida (401): connected false, providerMode hunter, expõe o status real', async () => {
    getPaidProspectingKeyMock.mockReturnValue('chave-invalida');
    const fetchMock = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkApolloConnection();

    expect(result.connected).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.providerMode).toBe('hunter');
    expect(result.message).toContain('401');
  });

  it('falha de rede/timeout é capturada e vira mensagem de erro, nunca propaga', async () => {
    getPaidProspectingKeyMock.mockReturnValue('fake-apollo-key');
    const fetchMock = vi.fn().mockRejectedValue(new Error('Timeout de rede'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkApolloConnection();

    expect(result.connected).toBe(false);
    expect(result.providerMode).toBe('hunter');
    expect(result.message).toBe('Timeout de rede');
  });
});

describe('parsePlanRestriction', () => {
  it('devolve false para qualquer status diferente de 403, mesmo com o corpo certo', () => {
    expect(
      parsePlanRestriction(401, JSON.stringify({ error_code: APOLLO_PLAN_RESTRICTED_CODE })),
    ).toBe(false);
    expect(
      parsePlanRestriction(500, JSON.stringify({ error_code: APOLLO_PLAN_RESTRICTED_CODE })),
    ).toBe(false);
  });

  it('403 com error_code API_INACCESSIBLE (JSON) é reconhecido como restrição de plano', () => {
    expect(parsePlanRestriction(403, JSON.stringify({ error_code: 'API_INACCESSIBLE' }))).toBe(
      true,
    );
  });

  it('403 com outro error_code (JSON válido) não é restrição de plano', () => {
    expect(parsePlanRestriction(403, JSON.stringify({ error_code: 'FORBIDDEN' }))).toBe(false);
  });

  it('403 com corpo não-JSON cai no fallback por substring', () => {
    expect(parsePlanRestriction(403, 'raw text mentioning API_INACCESSIBLE somewhere')).toBe(true);
    expect(parsePlanRestriction(403, 'corpo qualquer sem o código')).toBe(false);
  });
});
