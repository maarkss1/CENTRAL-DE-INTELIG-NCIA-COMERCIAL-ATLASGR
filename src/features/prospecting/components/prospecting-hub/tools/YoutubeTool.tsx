import { useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, Search } from 'lucide-react';
import { YoutubeIcon as Youtube } from '../../../../../components/ui/icons/YoutubeIcon';
import { api } from '../../../../../lib/api';
import { getErrorMessage } from './shared';

interface YoutubeVideoInfo {
  title: string;
  authorName: string;
  authorUrl: string;
  thumbnailUrl: string;
  videoUrl: string;
}

export function YoutubeTool(_props: { configured: boolean }) {
  const [url, setUrl] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<YoutubeVideoInfo | null>(null);

  const handleLookup = async () => {
    if (!url.trim()) {
      setError('Cole a URL de um vídeo do YouTube.');
      return;
    }
    setIsSearching(true);
    setError(null);
    setInfo(null);
    try {
      const result = await api.post<{ info: YoutubeVideoInfo | null; error?: string }>(
        '/api/prospecting/tools/youtube',
        { url: url.trim() },
        { timeoutMs: 12_000 },
      );
      setInfo(result.info);
      if (result.error) setError(result.error);
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao consultar o YouTube'));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
      <div className="xl:col-span-4 bg-surface p-6 rounded-2xl border border-line shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center text-brand">
            <Youtube size={18} />
          </div>
          <h2 className="font-black text-lg text-ink">YouTube</h2>
        </div>
        <p className="text-xs text-ink-2">
          Confere os metadados públicos (título, canal, thumbnail) de um vídeo já encontrado — via
          oEmbed oficial do YouTube, gratuito e sem chave.
        </p>

        <div className="flex items-start gap-3 p-4 rounded-xl border border-warn/30 bg-warn/10 text-amber-600 dark:text-amber-400 text-xs">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <p>
            Isto não é uma busca por palavra-chave — buscar vídeos por termo exige a Data API v3 do
            YouTube (chave própria). Cole o link de um vídeo já encontrado para conferir os dados
            públicos dele.
          </p>
        </div>

        <div>
          <label
            htmlFor="yt-url"
            className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2"
          >
            URL do vídeo
          </label>
          <input
            id="yt-url"
            type="text"
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
          />
        </div>

        <button
          onClick={handleLookup}
          disabled={isSearching}
          className="w-full bg-brand-active text-white py-3.5 rounded-xl font-bold hover:brightness-110 disabled:opacity-80 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
        >
          {isSearching ? (
            <>
              <Loader2 className="animate-spin" size={18} /> Consultando...
            </>
          ) : (
            <>
              <Search size={18} /> Consultar Vídeo
            </>
          )}
        </button>

        {error && <p className="text-xs text-danger-active dark:text-danger">{error}</p>}
      </div>

      <div className="xl:col-span-8">
        {!info && !isSearching && (
          <div className="bg-surface p-8 rounded-2xl border border-dashed border-line text-center text-ink-2 text-sm">
            Nenhuma consulta feita ainda — cole um link do YouTube ao lado.
          </div>
        )}
        {info && (
          <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden max-w-md">
            {info.thumbnailUrl && (
              <img src={info.thumbnailUrl} alt="" className="w-full aspect-video object-cover" />
            )}
            <div className="p-5 space-y-2">
              <p className="font-bold text-sm text-ink leading-snug">{info.title}</p>
              {info.authorName && (
                <a
                  href={info.authorUrl || info.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-ink-2 hover:text-ink"
                >
                  {info.authorName}
                </a>
              )}
              <a
                href={info.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-brand hover:underline pt-1"
              >
                <ExternalLink size={12} /> Abrir no YouTube
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
