import { useEffect, useState } from 'react';
import { FileBarChart, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { analyticsDB } from '../../../lib/db';
import { api } from '../../../lib/api';
import { useBrand } from '../../../contexts/BrandContext';
import { GlowChart } from '../../analytics/components/GlowChart';
import { analyticsApi, type MonthlyPoint } from '../../analytics/analytics.api';

type Metrics = Awaited<ReturnType<typeof analyticsDB.overview>>;

/** Converte o markdown simples do relatório (títulos, negrito, listas) em JSX sem depender de libs extras. */
function renderReportMarkdown(markdown: string) {
  return markdown.split('\n').map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={idx} className="h-2" />;
    if (trimmed.startsWith('### ')) return <h4 key={idx} className="font-black text-ink text-sm mt-4 mb-1">{trimmed.slice(4)}</h4>;
    if (trimmed.startsWith('## ')) return <h3 key={idx} className="font-black text-ink text-base mt-5 mb-2">{trimmed.slice(3)}</h3>;
    if (trimmed.startsWith('# ')) return <h2 key={idx} className="font-black text-ink text-lg mt-5 mb-2">{trimmed.slice(2)}</h2>;
    if (/^[-*]\s/.test(trimmed)) {
      return (
        <p key={idx} className="text-sm text-ink-2 leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-brand">
          {trimmed.replace(/^[-*]\s/, '')}
        </p>
      );
    }
    return <p key={idx} className="text-sm text-ink-2 leading-relaxed">{trimmed}</p>;
  });
}

export function ReportsHub() {
  const { activeBrand } = useBrand();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [report, setReport] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    analyticsDB
      .overview()
      .then((data) => { if (!cancelled) setMetrics(data); })
      .catch(() => { if (!cancelled) setError('Não foi possível carregar os dados da plataforma.'); })
      .finally(() => { if (!cancelled) setLoadingMetrics(false); });
    analyticsApi
      .dashboard(6)
      .then((data) => { if (!cancelled) setMonthly(data.monthly); })
      .catch(() => { if (!cancelled) setMonthly([]); });
    return () => { cancelled = true; };
  }, []);

  const handleGenerate = async () => {
    if (!metrics) return;
    setGenerating(true);
    setError(null);
    try {
      const { result } = await api.post<{ result: string }>(
        '/api/intelligence/report',
        { metrics, brandId: activeBrand },
        { timeoutMs: 90_000 },
      );
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar o relatório.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card variant="default" padding="lg" className="font-sans" accentBar>
      <CardHeader className="flex-row items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand/15 border border-brand/30 flex items-center justify-center text-brand shrink-0">
            <FileBarChart size={22} />
          </div>
          <div>
            <CardTitle className="text-gradient-brand">Relatórios & C-Level Analytics</CardTitle>
            <CardDescription>Geração e interpretação de análises estatísticas ao vivo por Inteligência Artificial.</CardDescription>
          </div>
        </div>
        <Button onClick={handleGenerate} disabled={generating || loadingMetrics || !metrics}>
          {generating ? <Loader2 size={16} className="animate-spin" /> : report ? <RefreshCw size={16} /> : <Sparkles size={16} />}
          <span className="ml-2">{generating ? 'Processando...' : report ? 'Gerar Novamente' : 'Interpretar Dados com IA'}</span>
        </Button>
      </CardHeader>

      {error && (
        <div className="mb-4 text-sm text-danger bg-danger/10 border border-danger/30 rounded-card px-4 py-3">{error}</div>
      )}

      <CardContent className="space-y-6">
        <div className="mb-8 w-full">
          <GlowChart data={monthly} />
        </div>

        {/* Métricas usadas como base do relatório */}
        <div className="rounded-card border border-line bg-surface-2 p-4">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-ink-2 mb-3">Dados-base (tempo real)</h4>
          {loadingMetrics ? (
            <div className="flex items-center gap-2 text-ink-2 text-sm py-4">
              <Loader2 size={16} className="animate-spin" /> Carregando métricas…
            </div>
          ) : metrics ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div><span className="text-ink-2 block">Empresas</span><span className="font-black text-ink">{metrics.totalCompanies}</span></div>
              <div><span className="text-ink-2 block">Contatos</span><span className="font-black text-ink">{metrics.totalContacts}</span></div>
              <div><span className="text-ink-2 block">Leads Ativos</span><span className="font-black text-ink">{metrics.totalLeads}</span></div>
              <div><span className="text-ink-2 block">Atividades</span><span className="font-black text-ink">{metrics.totalActivities}</span></div>
              <div><span className="text-ink-2 block">Fechados no Mês</span><span className="font-black text-success">{metrics.closedThisMonth}</span></div>
              {/* Não existe campo de valor no modelo Lead: exibimos "—" em vez de "R$ 0", que
                  seria lido como "pipeline zerado" e não como "métrica indisponível". */}
              <div><span className="text-ink-2 block">Valor em Pipeline</span><span className="font-black text-brand">{metrics.pipelineValue == null ? '—' : `R$ ${metrics.pipelineValue.toLocaleString('pt-BR')}`}</span></div>
              <div><span className="text-ink-2 block">Conversão</span><span className="font-black text-info">{metrics.conversionRate.toFixed(1)}%</span></div>
              <div><span className="text-ink-2 block">Pendentes</span><span className="font-black text-danger">{metrics.pendingActivities}</span></div>
            </div>
          ) : (
            <p className="text-sm text-ink-2">Sem dados disponíveis no momento.</p>
          )}
        </div>

        {/* Relatório Gerado */}
        <div className="rounded-card border border-brand/15 bg-surface-2 p-5 min-h-[160px]">
          {generating ? (
            <div className="flex items-center justify-center gap-2 text-ink-2 text-sm py-10">
              <Loader2 size={18} className="animate-spin" /> A IA está lendo os dados e escrevendo o relatório…
            </div>
          ) : report ? (
            <div>{renderReportMarkdown(report)}</div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-10">
              <Sparkles className="w-8 h-8 text-brand/50 mb-3" />
              <p className="text-sm text-ink-2 max-w-md">
                Clique no botão acima para que a nossa IA analise as métricas atuais e construa um diagnóstico executivo automático.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
