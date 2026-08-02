import { useEffect, useState } from 'react';
import { Phone, Loader2, AlertTriangle, CircleDot } from 'lucide-react';

import { Card } from '../../../components/ui/Card';
import { coldCallCampaignApi, type ColdCallStatus } from '../coldCallCampaign.api';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function formatWindow(status: ColdCallStatus): string {
    const dias = status.window.weekdaysOnly ? 'dias úteis' : 'todos os dias';
    return `${String(status.window.startHour).padStart(2, '0')}h–${String(status.window.endHour).padStart(2, '0')}h, ${dias} (${status.window.timeZone})`;
}

function haltedLabel(haltedBy: string | null): string | null {
    if (haltedBy === 'outside-window') return 'fora da janela de discagem';
    if (haltedBy === 'not-configured') return 'SDR de voz não configurado';
    return null;
}

/**
 * Visibilidade para a campanha de discagem fria (coldCall.service.ts) — até aqui ela só existia
 * em variável de ambiente e log; ninguém na operação tinha como ver se estava ligada, nem o que
 * fez na última execução. Somente leitura de propósito: ligar/desligar e disparar uma execução
 * manual continuam sendo decisões deliberadas via `.env`, não um botão que disca de verdade.
 */
export function ColdCallStatusCard() {
    const [status, setStatus] = useState<ColdCallStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        coldCallCampaignApi.status()
            .then((data) => { if (!cancelled) setStatus(data); })
            .catch((err) => { if (!cancelled) setError((err as Error).message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return (
            <Card padding="lg" className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando status do SDR de voz…
            </Card>
        );
    }

    if (error || !status) {
        return (
            <Card padding="lg" className="text-sm text-gray-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                {error || 'Não foi possível carregar o status da campanha fria.'}
            </Card>
        );
    }

    return (
        <Card padding="lg" accentBar>
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${status.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-400'}`}>
                        <Phone className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-white">Campanha de prospecção fria (SDR de voz)</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {status.enabled
                                ? `Ativa para esta organização · ${formatWindow(status)}`
                                : 'Desativada para esta organização — habilitada via variável de ambiente (SDR_COLD_CALL_ENABLED + SDR_COLD_CALL_ORGANIZATIONS).'}
                        </p>
                    </div>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                    status.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-400'
                }`}>
                    {status.enabled ? 'ativa' : 'inativa'}
                </span>
            </div>

            {status.enabled && (
                <p className="text-[11px] text-gray-500 mt-3">
                    Até {status.policy.maxAttemptsPerLead} tentativa(s) por lead, com pelo menos {status.policy.retryCooldownHours}h
                    entre uma ligação e a próxima.
                </p>
            )}

            <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-2">Últimas execuções</p>
                {status.recentRuns.length === 0 ? (
                    <p className="text-xs text-gray-500">Nenhuma execução registrada ainda.</p>
                ) : (
                    <div className="space-y-1.5">
                        {status.recentRuns.map((run) => {
                            const halted = haltedLabel(run.haltedBy);
                            const skippedTotal = run.skippedMaxAttempts + run.skippedCooldown + run.skippedNoPhone + run.skippedSuppressed + run.skippedError;
                            const when = new Date(run.runAt);
                            return (
                                <div key={run.id} className="flex items-center justify-between gap-3 text-xs text-gray-400 bg-white/[0.02] rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-2 shrink-0">
                                        <CircleDot className="w-3 h-3 text-gray-600" />
                                        <span className="text-gray-300 font-medium">
                                            {DIAS[when.getDay()]} {when.toLocaleDateString('pt-BR')} {when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    {halted ? (
                                        <span className="text-amber-400">{halted}</span>
                                    ) : (
                                        <span>
                                            {run.scanned} examinado(s) · {run.called} ligação(ões) · {skippedTotal} pulado(s)
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Card>
    );
}
