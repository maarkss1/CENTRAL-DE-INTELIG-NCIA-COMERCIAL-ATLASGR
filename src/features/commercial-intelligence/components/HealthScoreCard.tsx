import { useEffect, useState } from 'react';
import { AlertTriangle, HeartPulse } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { MetricInfo } from './MetricInfo';
import {
  commercialIntelligenceApi,
  type CommercialFilter,
  type HealthClassification,
  type HealthPillarScore,
  type HealthScoreResult,
} from '../commercialIntelligence.api';

const CLASSIFICATION_STYLE: Record<
  HealthClassification,
  { label: string; text: string; bar: string; badge: string }
> = {
  saudavel: {
    label: 'Saudável',
    text: 'text-success-active dark:text-success',
    bar: 'bg-success-active/80 dark:bg-success/80',
    badge: 'bg-surface border-success/40 text-success-active dark:text-success',
  },
  atencao: {
    label: 'Atenção',
    text: 'text-warning-active dark:text-warning',
    bar: 'bg-warning-active/80 dark:bg-warning/80',
    badge: 'bg-surface border-warning/40 text-warning-active dark:text-warning',
  },
  critico: {
    label: 'Crítico',
    text: 'text-critical',
    bar: 'bg-critical/80',
    badge: 'bg-surface border-critical/40 text-critical',
  },
};

const UNAVAILABLE_LABEL: Record<string, string> = {
  sem_meta_cadastrada: 'Sem meta cadastrada para o mês',
  coverage_nao_calculavel: 'Coverage não calculável (meta já batida ou zerada)',
  sem_negocios_fechados_no_periodo: 'Nenhum negócio fechado no período',
  sem_media_movel_calculavel: 'Sem 4 semanas de atividade para a média móvel',
  sem_negocios_avaliaveis: 'Nenhum negócio aberto para avaliar',
  sem_negocios_abertos: 'Nenhum negócio aberto',
  sem_historico_suficiente:
    'Sem snapshot de forecast de um mês já encerrado (o job semanal ainda não acumulou histórico)',
};

function overallClassification(score: number | null): HealthClassification | null {
  if (score == null) return null;
  if (score >= 70) return 'saudavel';
  if (score >= 40) return 'atencao';
  return 'critico';
}

function PillarRow({ pillar }: { pillar: HealthPillarScore }) {
  const style = pillar.classification ? CLASSIFICATION_STYLE[pillar.classification] : null;
  const reason = pillar.unavailableReason
    ? (UNAVAILABLE_LABEL[pillar.unavailableReason] ?? pillar.unavailableReason)
    : null;
  return (
    <li className="rounded-xl border border-line bg-surface-2/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-ink">{pillar.label}</p>
          {reason && <p className="mt-0.5 text-[11px] text-ink-2">Não disponível — {reason}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {style && (
            <span
              className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${style.badge}`}
            >
              {style.label}
            </span>
          )}
          <span
            className={`text-lg font-black [font-variant-numeric:tabular-nums] ${style ? style.text : 'text-ink-2'}`}
          >
            {pillar.score != null ? Math.round(pillar.score) : '—'}
          </span>
        </div>
      </div>
      {pillar.score != null && (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface"
          role="img"
          aria-label={`${pillar.label}: ${Math.round(pillar.score)} de 100`}
        >
          <div
            className={`h-full rounded-full ${style?.bar ?? 'bg-brand/70'}`}
            style={{ width: `${Math.max(2, Math.min(100, pillar.score))}%` }}
          />
        </div>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">
          Como este pilar é calculado
        </summary>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{pillar.explanation}</p>
        <p className="mt-1 text-[10px] text-ink-2/80">Fonte: {pillar.metricsUsed.join(' · ')}</p>
      </details>
    </li>
  );
}

/**
 * Health Score composto da operação comercial — 6 pilares nomeados que agregam métricas já
 * existentes (nunca um cálculo paralelo). Cada pilar explica sua fórmula e, quando não há dado,
 * diz exatamente por quê — nada de nota decorativa.
 */
export function HealthScoreCard({ filter }: { filter: CommercialFilter }) {
  const [data, setData] = useState<HealthScoreResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    commercialIntelligenceApi
      .healthScore(filter)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filter]);

  if (loading) return <Skeleton className="h-56 rounded-2xl" />;
  if (error)
    return (
      <Card padding="sm">
        <div className="flex items-center gap-2 text-sm text-critical">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {error}
        </div>
      </Card>
    );
  if (!data) return null;

  const overall = overallClassification(data.overallScore);
  const overallStyle = overall ? CLASSIFICATION_STYLE[overall] : null;
  const availableCount = data.pillars.filter((p) => p.score != null).length;

  return (
    <Card padding="sm" accentBar>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand/20 bg-brand/10 text-brand-active dark:text-brand-2">
            <HeartPulse className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-ink">Health Score da operação comercial</h3>
              <MetricInfo metricKey="health_score" />
            </div>
            <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-ink-2">
              Média simples dos pilares com dado disponível ({availableCount} de{' '}
              {data.pillars.length}). Pilar sem dado fica fora da média — nunca entra como zero.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 md:text-right">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-2">
              Score geral
            </p>
            <p
              className={`text-3xl font-black tracking-tight [font-variant-numeric:tabular-nums] ${overallStyle ? overallStyle.text : 'text-ink-2'}`}
            >
              {data.overallScore != null ? Math.round(data.overallScore) : 'Não disponível'}
              {data.overallScore != null && (
                <span className="text-sm font-bold text-ink-2"> / 100</span>
              )}
            </p>
          </div>
          {overallStyle && (
            <span
              className={`inline-block rounded-full border px-2.5 py-1 text-[11px] font-bold ${overallStyle.badge}`}
            >
              {overallStyle.label}
            </span>
          )}
        </div>
      </div>
      <ul
        className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3"
        aria-label="Pilares do Health Score"
      >
        {data.pillars.map((pillar) => (
          <PillarRow key={pillar.pillar} pillar={pillar} />
        ))}
      </ul>
    </Card>
  );
}
