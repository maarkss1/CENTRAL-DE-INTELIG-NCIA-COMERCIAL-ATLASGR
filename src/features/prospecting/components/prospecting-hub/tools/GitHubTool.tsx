import { useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Search, ShieldCheck } from 'lucide-react';
import { GithubIcon as Github } from '../../../../../components/ui/icons/GithubIcon';
import { api } from '../../../../../lib/api';
import { useBrand } from '../../../../../contexts/BrandContext';
import type { GithubOrgSummary } from '../../../services/github.service';
import { getErrorMessage, type PromoteResult } from './shared';

export function GitHubTool(_props: { configured: boolean }) {
  const { brandInfo } = useBrand();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<GithubOrgSummary[] | null>(null);

  const [promotingKey, setPromotingKey] = useState<string | null>(null);
  const [promoted, setPromoted] = useState<Record<string, PromoteResult>>({});

  const handleSearch = async () => {
    if (query.trim().length < 2) {
      setError('Informe ao menos 2 caracteres para buscar.');
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      const result = await api.post<{ organizations: GithubOrgSummary[]; error?: string }>(
        '/api/prospecting/tools/github',
        { query: query.trim(), limit: 12 },
        { timeoutMs: 15_000 },
      );
      setOrganizations(result.organizations);
      if (result.error) setError(result.error);
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao buscar no GitHub'));
    } finally {
      setIsSearching(false);
    }
  };

  const promoteOrg = async (org: GithubOrgSummary) => {
    setPromotingKey(org.login);
    setError(null);
    try {
      const { profile, error: profileError } = await api.post<{
        profile: {
          login: string;
          name: string | null;
          description: string | null;
          blog: string | null;
          location: string | null;
        } | null;
        error?: string;
      }>('/api/prospecting/tools/github/profile', { login: org.login }, { timeoutMs: 15_000 });

      if (!profile) {
        setError(profileError || 'Não foi possível carregar o perfil desta organização no GitHub.');
        return;
      }

      const result = await api.post<PromoteResult>('/api/prospecting/promote', {
        tradeName: profile.name || profile.login,
        location: profile.location || undefined,
        source: `${brandInfo.name} — Ferramenta GitHub`,
        autoEnrich: false,
        website: profile.blog || org.htmlUrl,
      });
      setPromoted((prev) => ({ ...prev, [org.login]: result }));
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao adicionar ao CRM'));
    } finally {
      setPromotingKey(null);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
      <div className="xl:col-span-4 bg-surface p-6 rounded-2xl border border-line shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center text-brand">
            <Github size={18} />
          </div>
          <h2 className="font-black text-lg text-ink">GitHub</h2>
        </div>
        <p className="text-xs text-ink-2">
          Busca organizações públicas no GitHub — sinal de maturidade técnica de uma empresa-alvo
          (site institucional, repositórios públicos). Gratuita, sem chave de API.
        </p>

        <div>
          <label
            htmlFor="gh-query"
            className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2"
          >
            Nome da empresa/organização
          </label>
          <input
            id="gh-query"
            type="text"
            placeholder="Ex: nubank, atlasgr..."
            className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>

        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="w-full bg-brand-active text-white py-3.5 rounded-xl font-bold hover:brightness-110 disabled:opacity-80 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
        >
          {isSearching ? (
            <>
              <Loader2 className="animate-spin" size={18} /> Buscando...
            </>
          ) : (
            <>
              <Search size={18} /> Buscar no GitHub
            </>
          )}
        </button>

        {error && <p className="text-xs text-danger-active dark:text-danger">{error}</p>}
        <p className="text-[11px] text-ink-2">
          Sujeita ao limite público de 10 buscas/min do GitHub — em uso intenso, aguarde alguns
          segundos entre buscas.
        </p>
      </div>

      <div className="xl:col-span-8 space-y-3">
        {(!organizations || organizations.length === 0) && !isSearching && (
          <div className="bg-surface p-8 rounded-2xl border border-dashed border-line text-center text-ink-2 text-sm">
            {organizations?.length === 0
              ? 'Nenhuma organização encontrada para esse termo.'
              : 'Nenhuma busca feita ainda — os resultados aparecem aqui.'}
          </div>
        )}
        {organizations?.map((org) => {
          const isPromoted = !!promoted[org.login];
          return (
            <div
              key={org.login}
              className="bg-surface p-5 rounded-2xl border border-line shadow-sm flex flex-wrap items-center gap-x-4 gap-y-2"
            >
              <img
                src={org.avatarUrl}
                alt=""
                className="w-9 h-9 rounded-full shrink-0 border border-line"
              />
              <div className="min-w-0">
                <p className="font-bold text-sm text-ink">{org.login}</p>
              </div>
              <a
                href={org.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-ink-2 hover:text-ink"
              >
                <ExternalLink size={12} /> Ver no GitHub
              </a>
              <div className="ml-auto">
                {isPromoted ? (
                  <span className="flex items-center gap-1.5 text-success-active dark:text-success font-bold text-xs">
                    <CheckCircle2 size={14} /> No CRM
                  </span>
                ) : (
                  <button
                    onClick={() => promoteOrg(org)}
                    disabled={promotingKey === org.login}
                    className="bg-brand-active text-white px-4 py-2 rounded-xl font-bold text-xs hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-60"
                  >
                    {promotingKey === org.login ? (
                      <Loader2 className="animate-spin" size={13} />
                    ) : (
                      <ShieldCheck size={13} />
                    )}
                    Salvar no CRM
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
