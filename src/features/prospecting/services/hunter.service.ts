import { logger } from '../../../lib/logger';
import { getPaidProspectingKey } from '../../../config/prospecting-integrations.js';
import { fetchWithProviderRetry } from '../../../lib/enrichment/providerFetch.js';
import { checkProviderRateLimit } from './providerRateLimit.js';
import { withProviderCache, buildProviderCacheKey } from './providerCache.js';
import { recordProviderCallCost } from './providerCostMetrics.js';
import { assertProspectingBudgetNotExceeded } from './providerBudget.js';

export interface HunterEmailResult {
  email: string | null;
  score?: number;
  /** Preenchido só quando a chamada de fato falhou (HTTP não-ok, rede, timeout) — sem isso,
   * "Hunter não tem esse e-mail" e "Hunter quebrou" chegavam ao chamador como o mesmo
   * `{ email: null }`, e um provider fora do ar virava silenciosamente "sem resultado". */
  error?: string;
}

export interface HunterPersonContact {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
}

interface HunterEmailFinderResponse {
  data?: { email?: string | null; score?: number };
}

interface HunterDomainSearchEmail {
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  value?: string | null;
  phone_number?: string | null;
  linkedin?: string | null;
}

interface HunterDomainSearchResponse {
  data?: { emails?: HunterDomainSearchEmail[] };
}

/**
 * Encontra/verifica um e-mail real de uma pessoa num domínio via Hunter.io Email Finder (tier gratuito).
 * Usado como fallback quando a Apollo não retorna e-mail para um decisor encontrado.
 */
export async function findEmailViaHunter(
  domain: string,
  fullName: string,
): Promise<HunterEmailResult> {
  const apiKey = getPaidProspectingKey('HUNTER_API_KEY');
  if (!apiKey || !domain || !fullName.trim()) return { email: null };

  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  const lastName = rest.join(' ');
  if (!firstName || !lastName) return { email: null };

  const cacheKey = buildProviderCacheKey('hunter', 'email-finder', { domain, fullName });
  return withProviderCache(
    cacheKey,
    () => findEmailViaHunterUncached(domain, firstName, lastName, apiKey),
    { shouldCache: (result) => !result.error },
  );
}

async function findEmailViaHunterUncached(
  domain: string,
  firstName: string,
  lastName: string,
  apiKey: string,
): Promise<HunterEmailResult> {
  const rateLimit = checkProviderRateLimit('hunter');
  if (!rateLimit.allowed) return { email: null, error: rateLimit.message };

  // DEC-09: bloqueio real de orçamento por organização — lança (não retorna um `{error}` suave
  // como o rate limit acima) de propósito, para propagar como erro HTTP real ao chamador em vez
  // de virar silenciosamente "sem resultado".
  await assertProspectingBudgetNotExceeded('hunter');

  try {
    const params = new URLSearchParams({
      domain,
      first_name: firstName,
      last_name: lastName,
      api_key: apiKey,
    });
    const res = await fetchWithProviderRetry(
      `https://api.hunter.io/v2/email-finder?${params.toString()}`,
      {},
      {
        timeoutMs: 12_000,
        providerName: 'Hunter-EmailFinder',
        billable: true,
        allowedHosts: ['api.hunter.io'],
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error({ status: res.status, domain }, 'Hunter.io Email Finder respondeu erro');
      return {
        email: null,
        error: `Hunter Email Finder respondeu ${res.status}: ${text.slice(0, 150)}`,
      };
    }
    recordProviderCallCost('hunter');
    const data = (await res.json()) as HunterEmailFinderResponse;
    return { email: data?.data?.email || null, score: data?.data?.score };
  } catch (error) {
    logger.error({ err: error, domain }, 'Error querying Hunter.io');
    return {
      email: null,
      error: error instanceof Error ? error.message : 'Falha ao consultar Hunter.io Email Finder',
    };
  }
}

/**
 * Descobre pessoas reais associadas a um domínio via Hunter.io Domain Search (tier gratuito
 * inclui um número limitado de buscas/mês). Diferente do Email Finder (que verifica UM nome já
 * conhecido), este endpoint varre a web por e-mails publicados nesse domínio e devolve nome,
 * cargo, senioridade, departamento e LinkedIn quando disponíveis — é a via usada como
 * alternativa real ao Apollo People Search quando a chave Apollo não tem esse escopo
 * (ver apollo.service.ts::parsePlanRestriction).
 */
export async function findPeopleViaDomainSearch(
  domain: string,
  limit: number = 10,
): Promise<{ contacts: HunterPersonContact[]; error?: string }> {
  const apiKey = getPaidProspectingKey('HUNTER_API_KEY');
  if (!apiKey || !domain) return { contacts: [] };

  const cacheKey = buildProviderCacheKey('hunter', 'domain-search', { domain, limit });
  return withProviderCache(
    cacheKey,
    () => findPeopleViaDomainSearchUncached(domain, limit, apiKey),
    { shouldCache: (result) => !result.error },
  );
}

async function findPeopleViaDomainSearchUncached(
  domain: string,
  limit: number,
  apiKey: string,
): Promise<{ contacts: HunterPersonContact[]; error?: string }> {
  const rateLimit = checkProviderRateLimit('hunter');
  if (!rateLimit.allowed) return { contacts: [], error: rateLimit.message };

  // DEC-09: ver comentário equivalente em findEmailViaHunterUncached acima.
  await assertProspectingBudgetNotExceeded('hunter');

  try {
    const params = new URLSearchParams({
      domain,
      api_key: apiKey,
      type: 'personal', // só e-mails associados a uma pessoa nomeada, não genéricos (contato@, sac@...)
      limit: String(Math.min(limit, 100)),
    });
    const res = await fetchWithProviderRetry(
      `https://api.hunter.io/v2/domain-search?${params.toString()}`,
      {},
      {
        timeoutMs: 12_000,
        providerName: 'Hunter-DomainSearch',
        billable: true,
        allowedHosts: ['api.hunter.io'],
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        contacts: [],
        error: `Hunter Domain Search respondeu ${res.status}: ${text.slice(0, 150)}`,
      };
    }
    recordProviderCallCost('hunter');
    const data = (await res.json()) as HunterDomainSearchResponse;
    const emails = data?.data?.emails || [];

    const contacts: HunterPersonContact[] = emails
      .filter((e) => e.first_name || e.last_name)
      .map((e) => ({
        name: `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Sem Nome',
        title: e.position || null,
        email: e.value || null,
        phone: e.phone_number || null,
        linkedin_url: e.linkedin || null,
      }));

    return { contacts };
  } catch (error) {
    logger.error({ err: error, domain }, 'Error querying Hunter.io Domain Search');
    return {
      contacts: [],
      error: error instanceof Error ? error.message : 'Falha ao consultar Hunter.io Domain Search',
    };
  }
}
