/**
 * LiveStatsWidget.tsx
 * Real-time platform stats from the PostgreSQL backend.
 * Shown on the home screen between the Clock and the 2 main cards.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Users, TrendingUp, Activity, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { analyticsDB } from '../../lib/db';
import { Card } from './Card';
import { Badge } from './Badge';

interface Stats {
  totalCompanies: number;
  totalContacts: number;
  totalLeads: number;
  totalActivities: number;
  pendingActivities: number;
  closedThisMonth: number;
  pipelineValue: number;
  conversionRate: number;
}

export function LiveStatsWidget() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await analyticsDB.overview();
        setStats(data);
        setConnected(true);
      } catch {
        // Fallback offline mode with placeholder data
        setStats({
          totalCompanies: 0,
          totalContacts: 0,
          totalLeads: 0,
          totalActivities: 0,
          pendingActivities: 0,
          closedThisMonth: 0,
          pipelineValue: 0,
          conversionRate: 0,
        });
        setConnected(false);
      } finally {
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 60_000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  const statCards = [
    {
      label: 'Empresas',
      value: stats?.totalCompanies ?? 0,
      icon: <Building2 className="w-5 h-5 text-atlas-orange" />,
      color: 'text-atlas-orange',
    },
    {
      label: 'Contatos',
      value: stats?.totalContacts ?? 0,
      icon: <Users className="w-5 h-5 text-success" />,
      color: 'text-success',
    },
    {
      label: 'Leads Ativos',
      value: stats?.totalLeads ?? 0,
      icon: <TrendingUp className="w-5 h-5 text-info" />,
      color: 'text-info',
    },
    {
      label: 'Atividades',
      value: stats?.totalActivities ?? 0,
      icon: <Activity className="w-5 h-5 text-danger" />,
      color: 'text-danger',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="w-full"
    >
      <Card variant="stat" padding="lg" className="rounded-card-lg" accentBar>
        {/* Header Row */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-black text-white">Visão Geral da Plataforma</h3>
            <p className="text-[11px] text-gray-400 font-medium">Dados em tempo real do banco de dados PostgreSQL</p>
          </div>

          {/* Database Connection Badge */}
          <Badge variant={connected ? 'success' : 'warning'} className="flex items-center gap-2 px-3.5 py-1.5">
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : connected ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            <span>{loading ? 'Conectando...' : connected ? 'PostgreSQL Conectado' : 'Modo Offline'}</span>
          </Badge>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((s, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 * idx }}
              className="p-4 rounded-card border border-white/10 bg-white/[0.03] flex items-center gap-3"
            >
              <div className="p-2 rounded-xl bg-white/5 border border-white/10 shadow-sm shrink-0">
                {s.icon}
              </div>
              <div>
                <p className={`text-xl font-black ${s.color}`}>
                  {loading ? '—' : s.value.toLocaleString('pt-BR')}
                </p>
                <p className="text-[11px] text-gray-400 font-semibold">{s.label}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Pipeline Metrics Row */}
        {stats && !loading && (
          <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-xs text-gray-400 font-medium">Fechados este Mês</p>
              <p className="text-lg font-black text-success">{stats.closedThisMonth}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 font-medium">Valor no Pipeline</p>
              <p className="text-lg font-black text-atlas-orange">
                {stats.pipelineValue > 0
                  ? `R$ ${(stats.pipelineValue / 1000).toFixed(0)}k`
                  : 'R$ —'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 font-medium">Taxa de Conversão</p>
              <p className="text-lg font-black text-info">
                {stats.conversionRate > 0 ? `${stats.conversionRate.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
