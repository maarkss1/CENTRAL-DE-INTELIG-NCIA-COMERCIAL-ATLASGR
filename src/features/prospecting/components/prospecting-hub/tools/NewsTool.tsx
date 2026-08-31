import { useState } from 'react';
import { ExternalLink, Loader2, Newspaper, Search } from 'lucide-react';
import { api } from '../../../../../lib/api';
import { getErrorMessage } from './shared';

interface NewsMention {
  title: string;
  url: string;
  domain: string;
  seenAt: string;
}

function formatSeenAt(seenAt: string): string {
  // GDELT devolve `seendate` no formato compacto YYYYMMDDTHHMMSSZ.
  const match = /^(\d{4})(\d{2})(\d{2})T/.exec(seenAt);
  if (!match) return seenAt;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function NewsTool(_props: { configured: boolean }) {
  const [companyName, setCompanyName] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentions, setMentions] = useState<NewsMention[] | null>(null);

  const handleSearch = async () => {
    if (companyName.trim().length < 3) {
      setError('Informe o nome da empresa (mínimo 3 caracteres).');
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      const result = await api.post<{ mentions: NewsMention[] }>(
        '/api/prospecting/tools/news',
        { companyName: companyName.trim() },
        { timeoutMs: 15_000 },
      );
      setMentions(result.mentions);
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao buscar notícias'));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
      <div className="xl:col-span-4 bg-surface p-6 rounded-2xl border border-line shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center text-brand">
            <Newspaper size={18} />
          </div>
          <h2 className="font-black text-lg text-ink">Notícias</h2>
        </div>
        <p className="text-xs text-ink-2">
          Menções recentes de imprensa sobre uma empresa via GDELT (índice global de notícias,
          gratuito, sem chave, últimos 6 meses).
        </p>

        <div>
          <label
            htmlFor="news-empresa"
            className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2"
          >
            Nome da empresa
          </label>
          <input
            id="news-empresa"
            type="text"
            placeholder="Nome completo da empresa"
            className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
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
              <Search size={18} /> Buscar Notícias
            </>
          )}
        </button>

        {error && <p className="text-xs text-danger-active dark:text-danger">{error}</p>}
        <p className="text-[11px] text-ink-2">
          Sem SEARXNG_URL configurado, a busca cai no GDELT diretamente — nomes de empresa muito
          genéricos podem trazer poucos ou nenhum resultado.
        </p>
      </div>

      <div className="xl:col-span-8 space-y-3">
        {(!mentions || mentions.length === 0) && !isSearching && (
          <div className="bg-surface p-8 rounded-2xl border border-dashed border-line text-center text-ink-2 text-sm">
            {mentions?.length === 0
              ? 'Nenhuma menção recente encontrada para essa empresa.'
              : 'Nenhuma busca feita ainda — os resultados aparecem aqui.'}
          </div>
        )}
        {mentions?.map((mention, idx) => (
          <a
            key={`${mention.url}-${idx}`}
            href={mention.url}
            target="_blank"
            rel="noreferrer"
            className="block bg-surface p-5 rounded-2xl border border-line shadow-sm hover:border-brand/40 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-bold text-sm text-ink leading-snug">{mention.title}</p>
              <ExternalLink size={14} className="text-ink-2 shrink-0 mt-0.5" />
            </div>
            <p className="text-xs text-ink-2 mt-1.5">
              {mention.domain}
              {mention.seenAt && ` · ${formatSeenAt(mention.seenAt)}`}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
