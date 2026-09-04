import { logger } from '../../../lib/logger';
import { fetchWithProviderRetry } from '../../../lib/enrichment/providerFetch.js';
import { checkProviderRateLimit } from './providerRateLimit.js';
import { withProviderCache, buildProviderCacheKey } from './providerCache.js';

/**
 * Busca gratuita, sem chave, via API pública do GitHub — a fonte "sem chave" mais próxima do que
 * o link do Agent Reach (github.com/Panniantong/Agent-Reach) usa por baixo dos panos para esse
 * canal, reimplementada nativamente em Node em vez de depender do instalador Python/pipx da
 * ferramenta (incompatível com o build 100% npm deste serviço no Render — ver render.yaml).
 *
 * Serve como sinal de maturidade técnica de uma empresa-alvo (tem organização pública no GitHub?
 * site institucional no perfil? quantos repositórios públicos?) — não substitui Apollo/Hunter para
 * firmográfico ou contato de decisor.
 */

const GITHUB_API_BASE = 'https://api.github.com';
// GitHub exige um User-Agent em toda chamada à API (requisições sem ele levam 403) — não é uma
// chave, é um identificador de cliente público.
const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'atlasgr-prospector',
  'X-GitHub-Api-Version': '2022-11-28',
};

export interface GithubOrgSummary {
  login: string;
  htmlUrl: string;
  avatarUrl: string;
}

export interface GithubOrgProfile {
  login: string;
  name: string | null;
  description: string | null;
  blog: string | null;
  location: string | null;
  publicRepos: number;
  htmlUrl: string;
  avatarUrl: string;
}

interface GithubSearchUsersResponse {
  items?: Array<{ login: string; html_url: string; avatar_url: string }>;
}

interface GithubOrgResponse {
  login: string;
  name?: string | null;
  description?: string | null;
  blog?: string | null;
  location?: string | null;
  public_repos?: number;
  html_url: string;
  avatar_url: string;
}

/**
 * Busca organizações do GitHub por nome (Search API, endpoint `/search/users?type:org`). Limite
 * público real do endpoint de busca não-autenticado é 10 req/min por IP (bem mais baixo que os
 * 60/h do restante da API REST) — protegido pelo mesmo token bucket dos demais providers
 * (`checkProviderRateLimit`), com teto conservador abaixo desses 10/min.
 */
export async function searchGithubOrganizations(
  query: string,
  limit: number = 10,
): Promise<{ organizations: GithubOrgSummary[]; error?: string }> {
  const trimmed = query.trim();
  if (!trimmed) return { organizations: [] };

  const cacheKey = buildProviderCacheKey('github', 'search-orgs', { query: trimmed, limit });
  return withProviderCache(cacheKey, () => searchGithubOrganizationsUncached(trimmed, limit), {
    shouldCache: (result) => !result.error,
  });
}

async function searchGithubOrganizationsUncached(
  query: string,
  limit: number,
): Promise<{ organizations: GithubOrgSummary[]; error?: string }> {
  const rateLimit = checkProviderRateLimit('github');
  if (!rateLimit.allowed) return { organizations: [], error: rateLimit.message };

  try {
    const params = new URLSearchParams({
      q: `${query} type:org`,
      per_page: String(Math.min(Math.max(limit, 1), 25)),
    });
    const res = await fetchWithProviderRetry(
      `${GITHUB_API_BASE}/search/users?${params.toString()}`,
      { headers: GITHUB_HEADERS },
      { timeoutMs: 10_000, providerName: 'GitHub-SearchOrgs', allowedHosts: ['api.github.com'] },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error({ status: res.status, query }, 'GitHub Search API respondeu erro');
      return {
        organizations: [],
        error: `GitHub Search API respondeu ${res.status}: ${text.slice(0, 150)}`,
      };
    }
    const data = (await res.json()) as GithubSearchUsersResponse;
    const organizations: GithubOrgSummary[] = (data.items || []).map((item) => ({
      login: item.login,
      htmlUrl: item.html_url,
      avatarUrl: item.avatar_url,
    }));
    return { organizations };
  } catch (error) {
    logger.error({ err: error, query }, 'Error querying GitHub Search API');
    return {
      organizations: [],
      error: error instanceof Error ? error.message : 'Falha ao consultar a API do GitHub',
    };
  }
}

/**
 * Perfil completo de UMA organização já identificada (nome, descrição, site institucional,
 * localização) — usado ao "Salvar no CRM" um resultado de `searchGithubOrganizations`, mesmo
 * padrão de duas etapas do Hunter (busca ampla + verificação pontual) para não gastar cota do
 * rate limit de busca com dados que só uma seleção precisa.
 */
export async function getGithubOrganizationProfile(
  login: string,
): Promise<{ profile: GithubOrgProfile | null; error?: string }> {
  const trimmed = login.trim();
  if (!trimmed) return { profile: null };

  const cacheKey = buildProviderCacheKey('github', 'org-profile', { login: trimmed });
  return withProviderCache(cacheKey, () => getGithubOrganizationProfileUncached(trimmed), {
    shouldCache: (result) => !result.error,
  });
}

async function getGithubOrganizationProfileUncached(
  login: string,
): Promise<{ profile: GithubOrgProfile | null; error?: string }> {
  const rateLimit = checkProviderRateLimit('github');
  if (!rateLimit.allowed) return { profile: null, error: rateLimit.message };

  try {
    const res = await fetchWithProviderRetry(
      `${GITHUB_API_BASE}/orgs/${encodeURIComponent(login)}`,
      { headers: GITHUB_HEADERS },
      { timeoutMs: 10_000, providerName: 'GitHub-OrgProfile', allowedHosts: ['api.github.com'] },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        profile: null,
        error: `GitHub Org Profile respondeu ${res.status}: ${text.slice(0, 150)}`,
      };
    }
    const data = (await res.json()) as GithubOrgResponse;
    return {
      profile: {
        login: data.login,
        name: data.name ?? null,
        description: data.description ?? null,
        blog: data.blog ?? null,
        location: data.location ?? null,
        publicRepos: data.public_repos ?? 0,
        htmlUrl: data.html_url,
        avatarUrl: data.avatar_url,
      },
    };
  } catch (error) {
    logger.error({ err: error, login }, 'Error querying GitHub Org Profile');
    return {
      profile: null,
      error: error instanceof Error ? error.message : 'Falha ao consultar o perfil no GitHub',
    };
  }
}
