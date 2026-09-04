/**
 * LiveStatsWidget.tsx
 * Real-time platform stats from the PostgreSQL backend.
 * Shown on the home screen between the Clock and the 2 main cards.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  Users,
  TrendingUp,
  Activity,
  Wifi,
  WifiOff,
  Loader2,
  RotateCw,
  AlertTriangle,
} from 'lucide-react';
import { analyticsDB } from '../../lib/db';

import { Badge } from './Badge';

interface Stats {
  totalCompanies: number;
  totalContacts: number;
  totalLeads: number;
  totalActivities: number;
  pendingActivities: number;
  overdueActivities: number;
  closedThisMonth: number;
  lostThisMonth: number;
  /** `null` porque o modelo Lead não tem campo de valor monetário — a UI exibe "—". */
  pipelineValue: number | null;
  conversionRate: number;
  averageScore: number | null;
}

export function LiveStatsWidget() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await analyticsDB.overview();
      setStats(data);
      setConnected(true);
      setErrorMessage(null);
    } catch (error) {
      setStats(null);
      setConnected(false);
      setErrorMessage(
        error instanceof Error ? error.message : 'Falha ao carregar dados executivos.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // refresh every 60s
    return () => clearInterval(interval);
  }, [load]);

  const statCards = [
    {
      label: 'Empresas',
      value: stats?.totalCompanies,
      icon: <Building2 className="w-5 h-5 text-brand" />,
      color: 'text-brand',
    },
    {
      label: 'Contatos',
      value: stats?.totalContacts,
      icon: <Users className="w-5 h-5 text-success-active dark:text-success" />,
      color: 'text-success-active dark:text-success',
    },
    {
      label: 'Leads Ativos',
      value: stats?.totalLeads,
      icon: <TrendingUp className="w-5 h-5 text-info-active dark:text-info" />,
      color: 'text-info-active dark:text-info',
    },
    {
      label: 'Atividades',
      value: stats?.totalActivities,
      icon: <Activity className="w-5 h-5 text-danger-active dark:text-danger" />,
      color: 'text-danger-active dark:text-danger',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="w-full"
    >
      <div className="p-5 rounded-card-lg border border-line bg-surface shadow-card relative overflow-hidden text-ink font-sans">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand to-brand-2" />

        {/* Header Row */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-black text-ink">Visão Geral da Plataforma</h3>
            <p className="text-[11px] text-ink-2 font-medium">
              {connected
                ? 'Dados em tempo real do banco de dados PostgreSQL'
                : 'Dados indisponíveis: nenhum valor demonstrativo será exibido'}
            </p>
          </div>

          {/* Database Connection Badge */}
          <div className="flex items-center gap-2">
            <Badge
              variant={connected ? 'success' : 'warning'}
              className={`flex items-center gap-2 px-3.5 py-1.5 ${connected ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : connected ? (
                <Wifi className="w-3.5 h-3.5" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              <span>
                {loading ? 'Conectando...' : connected ? 'PostgreSQL Conectado' : 'Modo Offline'}
              </span>
            </Badge>
            {!loading && !connected && (
              <button
                type="button"
                onClick={load}
                title="Tentar reconectar"
                aria-label="Tentar reconectar ao banco de dados"
                className="p-1.5 rounded-lg bg-slate-100 border border-slate-200 hover:border-brand text-slate-500 hover:text-brand transition-all cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {!loading && !connected && (
          <div
            className="mb-4 p-4 rounded-card border border-amber-500/30 bg-amber-500/10 flex items-start justify-between gap-3"
            role="status"
          >
            <div className="flex items-start gap-2.5 text-sm text-amber-100">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
              <div>
                <p className="font-bold">Métricas executivas offline.</p>
                <p className="text-xs text-amber-100/80">
                  Não há conexão confirmada com o backend; os cards abaixo mostram travessões, não
                  zeros reais.
                  {errorMessage ? ` Detalhe técnico: ${errorMessage}` : ''}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((s, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 * idx }}
              className="p-4 rounded-card border border-line bg-surface-2 flex items-center gap-3"
            >
              <div className="p-2 rounded-xl bg-surface border border-line shadow-sm shrink-0">
                {s.icon}
              </div>
              <div>
                <p className={`text-xl font-black ${s.color}`}>
                  {loading || s.value == null ? '—' : s.value.toLocaleString('pt-BR')}
                </p>
                <p className="text-[11px] text-ink-2 font-semibold">{s.label}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Pipeline Metrics Row */}
        {stats && !loading && (
          <div className="mt-4 pt-4 border-t border-line grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-xs text-ink-2 font-medium">Fechados este Mês</p>
              <p className="text-lg font-black text-ok-active dark:text-ok">
                {stats.closedThisMonth}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-ink-2 font-medium">Valor no Pipeline</p>
              {/* var(--brand-2) fixo, não token de marca dinâmico: este número sempre aparecia
                  azul Total Trac mesmo com AtlasGR ativa (`text-totaltrack-blue` é uma classe
                  estática de marca, proibida fora de tela pré-seleção — CLAUDE.md regra visual
                  3). Achado e corrigido no Piloto 007, ver .claude/PILOTS.md. */}
              <p className="text-lg font-black text-brand-2">
                {stats.pipelineValue != null && stats.pipelineValue > 0
                  ? `R$ ${(stats.pipelineValue / 1000).toFixed(0)}k`
                  : 'R$ —'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-ink-2 font-medium">Taxa de Conversão</p>
              <p className="text-lg font-black text-brand">
                {stats.conversionRate > 0 ? `${stats.conversionRate.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
