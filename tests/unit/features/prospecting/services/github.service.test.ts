/**
 * `github.service.ts` — busca gratuita/sem chave na API pública do GitHub (Search Users + Org
 * Profile). Mesmo padrão de `hunter.service.test.ts`: mocka `fetch` diretamente e reseta
 * cache/rate limit entre casos para não vazar estado de um teste para o outro.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  searchGithubOrganizations,
  getGithubOrganizationProfile,
} from '@/features/prospecting/services/github.service.js';
import { resetProviderCacheForTests } from '@/features/prospecting/services/providerCache.js';
import { resetProviderRateLimitersForTests } from '@/features/prospecting/services/providerRateLimit.js';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

const originalEnv = { ...process.env };

beforeEach(async () => {
  await resetProviderCacheForTests();
  resetProviderRateLimitersForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

describe('searchGithubOrganizations', () => {
  it('query vazia devolve lista vazia sem tentar a rede', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchGithubOrganizations('   ');

    expect(result).toEqual({ organizations: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('devolve as organizações encontradas no caminho feliz', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        items: [
          { login: 'atlasgr', html_url: 'https://github.com/atlasgr', avatar_url: 'https://x/a.png' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchGithubOrganizations('atlasgr', 5);

    expect(result).toEqual({
      organizations: [
        { login: 'atlasgr', htmlUrl: 'https://github.com/atlasgr', avatarUrl: 'https://x/a.png' },
      ],
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['User-Agent']).toBe('atlasgr-prospector');
  });

  it('resposta não-ok (ex: 403 rate limit real do GitHub) preenche `.error` em vez de mascarar como lista vazia', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { message: 'API rate limit exceeded' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchGithubOrganizations('empresa');

    expect(result.organizations).toEqual([]);
    expect(result.error).toContain('403');
  });

  it('rate limit interno bloqueia sem chamar a rede quando o teto/min é excedido', async () => {
    process.env.GITHUB_RATE_LIMIT_PER_MINUTE = '1';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await searchGithubOrganizations('empresa-um');
    const result = await searchGithubOrganizations('empresa-dois');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.organizations).toEqual([]);
    expect(result.error).toContain('Rate limit');
  });
});

describe('getGithubOrganizationProfile', () => {
  it('login vazio devolve profile:null sem tentar a rede', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await getGithubOrganizationProfile('  ');

    expect(result).toEqual({ profile: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('devolve o perfil completo no caminho feliz', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        login: 'atlasgr',
        name: 'AtlasGR',
        description: 'Revenue OS de logística',
        blog: 'https://atlasgr.com.br',
        location: 'São Paulo, BR',
        public_repos: 12,
        html_url: 'https://github.com/atlasgr',
        avatar_url: 'https://x/a.png',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getGithubOrganizationProfile('atlasgr');

    expect(result.profile).toEqual({
      login: 'atlasgr',
      name: 'AtlasGR',
      description: 'Revenue OS de logística',
      blog: 'https://atlasgr.com.br',
      location: 'São Paulo, BR',
      publicRepos: 12,
      htmlUrl: 'https://github.com/atlasgr',
      avatarUrl: 'https://x/a.png',
    });
  });

  it('resposta não-ok preenche `.error` em vez de devolver profile:null silenciosamente', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, {}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getGithubOrganizationProfile('inexistente');

    expect(result.profile).toBeNull();
    expect(result.error).toContain('404');
  });
});
