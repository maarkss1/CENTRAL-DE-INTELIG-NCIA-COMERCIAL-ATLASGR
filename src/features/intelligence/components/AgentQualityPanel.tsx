import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  AlertTriangle,
  DollarSign,
  Clock,
  UserCheck,
  RotateCcw,
  Wrench,
  Lock,
  HelpCircle,
  Database,
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { staggerContainer, staggerItem } from '../../../lib/motion';
import { api } from '../../../lib/api';

// Tipos duplicados localmente (não importados do serviço de backend) — mesmo padrão já usado em
// useBitrixIntegration.ts para BitrixConnectionSummary. Espelham exatamente
// src/features/intelligence/services/evaluationMetrics.service.ts / goldenDataset.service.ts.
interface SloRate {
  numerator: number;
  denominator: number;
  rate: number | null;
  emptyReason?: string;
}

interface AvailableMetric<T> {
  available: true;
  value: T;
  note?: string;
}
interface UnavailableMetric {
  available: false;
  reason: string;
}
type Metric<T> = AvailableMetric<T> | UnavailableMetric;

interface EvaluationMetricsSnapshot {
  organizationId: string;
  windowDays: number;
  generatedAt: string;
  dimensions: {
    cost: Metric<{ totalCostUsd: number; totalTokens: number; requestCount: number }>;
    latency: Metric<{ avgLatencyMs: number | null }>;
    humanOverride: Metric<SloRate>;
    fallbackRate: Metric<SloRate>;
    toolCorrectness: Metric<SloRate>;
    piiLeakageRate: Metric<SloRate>;
    factuality: UnavailableMetric;
    playbookAdherence: UnavailableMetric;
    hallucination: UnavailableMetric;
  };
}

interface GoldenDatasetSummary {
  version: string;
  generatedAt: string;
  totalCases: number;
  countByCategory: Record<string, number>;
}

interface ToolUseValidationResult {
  caseId: string;
  valid: boolean;
  error?: string;
}

interface GoldenDatasetResponse {
  summary: GoldenDatasetSummary;
  toolUseValidation: ToolUseValidationResult[];
}

function formatUsd(value: number): string {
  return `US$ ${value.toFixed(2)}`;
}

function formatRate(rate: SloRate): string {
  if (rate.rate == null) return '—';
  return `${(rate.rate * 100).toFixed(1)}%`;
}

/** Card de uma dimensão disponível — número real + nota de cobertura/proxy, quando houver. */
function MetricTile({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <motion.div
      variants={staggerItem}
      className="p-4 rounded-card border border-line bg-surface-2 flex items-start gap-3"
    >
      <div className="p-2 rounded-xl bg-soft text-brand shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-ink-2 uppercase tracking-wide">{label}</p>
        <p className="text-lg font-black text-ink leading-tight mt-0.5">{value}</p>
        {note && <p className="text-[10px] text-ink-2 mt-1 leading-relaxed">{note}</p>}
      </div>
    </motion.div>
  );
}

/** Card de uma dimensão indisponível — nunca escondida, sempre com o motivo real. */
function UnavailableTile({ label, reason }: { label: string; reason: string }) {
  return (
    <motion.div
      variants={staggerItem}
      className="p-4 rounded-card border border-line bg-surface-2/50 flex items-start gap-3 opacity-80"
    >
      <div className="p-2 rounded-xl bg-warning/10 text-warning-active dark:text-warning shrink-0">
        <Lock className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-ink-2 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-bold text-ink-2 mt-0.5">Indisponível</p>
        <p className="text-[10px] text-ink-2 mt-1 leading-relaxed">{reason}</p>
      </div>
    </motion.div>
  );
}

/**
 * Vitrine do harness real de avaliação de qualidade do enxame de IA (9 dimensões, `AI-006`) e do
 * Golden Dataset versionado (`AI-005`) — os dois já existiam no backend, testados, sem nenhum
 * consumidor de frontend (achado do Piloto 012). Reaproveita GET /api/agent/evaluation-metrics e
 * GET /api/agent/golden-dataset/summary tal como já existem — zero rota nova. Dimensões
 * indisponíveis (factualidade/aderência ao playbook/alucinação) são mostradas com o motivo real,
 * nunca escondidas ou fabricadas com um número — mesmo princípio de honestidade já usado em
 * IntegrationTruthBox (Piloto 011).
 */
export function AgentQualityPanel() {
  const [metrics, setMetrics] = useState<EvaluationMetricsSnapshot | null>(null);
  const [dataset, setDataset] = useState<GoldenDatasetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<EvaluationMetricsSnapshot>('/api/agent/evaluation-metrics?days=30'),
      api.get<GoldenDatasetResponse>('/api/agent/golden-dataset/summary'),
    ])
      .then(([metricsData, datasetData]) => {
        if (cancelled) return;
        setMetrics(metricsData);
        setDataset(datasetData);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Falha ao carregar as métricas de qualidade.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-card border border-danger/30 bg-danger/10 flex items-center gap-2.5 text-sm text-danger-active dark:text-danger">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        {error}
      </div>
    );
  }

  if (!metrics || !dataset) return null;

  const { dimensions } = metrics;
  const invalidToolCases = dataset.toolUseValidation.filter((c) => !c.valid);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-ink flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand" /> Qualidade do Enxame de IA
          </h2>
          <p className="text-[11px] text-ink-2 mt-0.5">
            Últimos {metrics.windowDays} dias · atualizado em{' '}
            {new Date(metrics.generatedAt).toLocaleString('pt-BR')}
          </p>
        </div>
      </div>

      <motion.div
        variants={staggerContainer()}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-3 gap-3"
      >
        {dimensions.cost.available && (
          <MetricTile
            icon={<DollarSign className="w-4 h-4" />}
            label="Custo do período"
            value={formatUsd(dimensions.cost.value.totalCostUsd)}
            note={`${dimensions.cost.value.requestCount} chamada(s) · ${dimensions.cost.value.totalTokens.toLocaleString('pt-BR')} tokens`}
          />
        )}
        {dimensions.latency.available && (
          <MetricTile
            icon={<Clock className="w-4 h-4" />}
            label="Latência média"
            value={
              dimensions.latency.value.avgLatencyMs != null
                ? `${Math.round(dimensions.latency.value.avgLatencyMs)}ms`
                : '—'
            }
          />
        )}
        {dimensions.humanOverride.available && (
          <MetricTile
            icon={<UserCheck className="w-4 h-4" />}
            label="Override humano"
            value={formatRate(dimensions.humanOverride.value)}
            note={dimensions.humanOverride.value.emptyReason}
          />
        )}
        {dimensions.fallbackRate.available && (
          <MetricTile
            icon={<RotateCcw className="w-4 h-4" />}
            label="Taxa de fallback"
            value={formatRate(dimensions.fallbackRate.value)}
            note={dimensions.fallbackRate.note ?? dimensions.fallbackRate.value.emptyReason}
          />
        )}
        {dimensions.toolCorrectness.available && (
          <MetricTile
            icon={<Wrench className="w-4 h-4" />}
            label="Corretude de ferramenta"
            value={formatRate(dimensions.toolCorrectness.value)}
            note={dimensions.toolCorrectness.note ?? dimensions.toolCorrectness.value.emptyReason}
          />
        )}
        {dimensions.piiLeakageRate.available && (
          <MetricTile
            icon={<Lock className="w-4 h-4" />}
            label="Taxa de vazamento de PII"
            value={formatRate(dimensions.piiLeakageRate.value)}
            note={dimensions.piiLeakageRate.note ?? dimensions.piiLeakageRate.value.emptyReason}
          />
        )}
        <UnavailableTile label="Factualidade" reason={dimensions.factuality.reason} />
        <UnavailableTile
          label="Aderência ao playbook"
          reason={dimensions.playbookAdherence.reason}
        />
        <UnavailableTile label="Alucinação" reason={dimensions.hallucination.reason} />
      </motion.div>

      <Card padding="sm">
        <h3 className="text-sm font-bold text-ink flex items-center gap-2 mb-1">
          <Database className="w-4 h-4 text-brand" /> Golden Dataset
        </h3>
        <p className="text-[11px] text-ink-2 mb-3">
          Conjunto versionado de casos de referência usado para validar as 3 dimensões acima quando
          disponíveis — v{dataset.summary.version}, {dataset.summary.totalCases} caso(s), gerado em{' '}
          {new Date(dataset.summary.generatedAt).toLocaleDateString('pt-BR')}.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {Object.entries(dataset.summary.countByCategory).map(([category, count]) => (
            <span
              key={category}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-surface-2 border border-line text-ink-2"
            >
              {category}: {count}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          {invalidToolCases.length === 0 ? (
            <span className="flex items-center gap-1.5 text-success-active dark:text-success font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" /> {dataset.toolUseValidation.length} caso(s) de
              uso de ferramenta validados contra o schema real
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-danger-active dark:text-danger font-semibold">
              <HelpCircle className="w-3.5 h-3.5" /> {invalidToolCases.length} de{' '}
              {dataset.toolUseValidation.length} caso(s) de uso de ferramenta falharam a validação
              de schema
            </span>
          )}
        </div>
      </Card>

      <div className="flex items-start gap-2.5 p-3.5 rounded-card border border-line bg-surface-2 text-[11px] text-ink-2">
        <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-ink-2" aria-hidden="true" />
        As 3 dimensões indisponíveis exigem uma resposta de referência do Golden Dataset para
        comparar contra o que a IA gerou — nenhuma delas é reportada como &quot;0&quot; ou escondida
        silenciosamente.
      </div>
    </div>
  );
}
