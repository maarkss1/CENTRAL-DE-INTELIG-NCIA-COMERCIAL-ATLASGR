import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';
import type { MarketIntelligenceManifest, TerritoryRecord } from '../domain/MarketIntelligence';
import { loadMarketIntelligenceSnapshot } from '../marketIntelligence.data';
import { TerritoryEconomicSimulator } from './TerritoryEconomicSimulator';

export function MarketIntelligenceEconomics() {
    const [manifest, setManifest] = useState<MarketIntelligenceManifest | null>(null);
    const [territories, setTerritories] = useState<TerritoryRecord[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        loadMarketIntelligenceSnapshot()
            .then((snapshot) => {
                if (!alive) return;
                setManifest(snapshot.manifest);
                setTerritories(snapshot.territories);
            })
            .catch((cause: unknown) => {
                if (!alive) return;
                setError(cause instanceof Error ? cause.message : 'Falha ao carregar os territórios para unit economics.');
            });
        return () => { alive = false; };
    }, []);

    if (error) {
        return <div role="alert" className="m-4 rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 md:m-7"><AlertTriangle className="mb-2 h-5 w-5" aria-hidden="true" />{error}</div>;
    }
    if (!manifest) {
        return <div className="flex min-h-64 items-center justify-center"><div className="flex items-center gap-2 text-sm font-bold text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden="true" />Carregando unit economics territorial...</div></div>;
    }
    if (!territories.length) {
        return (
            <div className="m-4 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 md:m-7">
                <AlertTriangle className="mb-2 h-5 w-5" aria-hidden="true" />
                <p className="font-black">Simulador econômico aguardando ao menos um território materializado.</p>
                <p className="mt-2 leading-6">Sem território não existe TAM territorial observável para iniciar a simulação. Nenhum número é inventado para preencher essa lacuna.</p>
            </div>
        );
    }

    return (
        <div className="bg-[#F7F7F5] p-4 md:p-7">
            <div className="mx-auto w-full max-w-[1600px] space-y-4">
                {!manifest.decisionReady && (
                    <section
                        role="status"
                        aria-label="Simulação exploratória com decisão final bloqueada"
                        className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-900 md:p-6"
                    >
                        <div className="flex items-start gap-3">
                            <div className="rounded-2xl bg-amber-100 p-2.5"><ShieldAlert className="h-5 w-5" aria-hidden="true" /></div>
                            <div className="min-w-0">
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-800">SIMULAÇÃO EXPLORATÓRIA · DECISÃO FINAL BLOQUEADA</p>
                                <h2 className="mt-1 text-lg font-black text-[#333333]">Você pode testar a economia dos territórios Core, mas o resultado não autoriza a contratação.</h2>
                                <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">
                                    Custos, ticket, margem, funil, SAM e política financeira continuam editáveis para planejamento. A ordem Vendedor 01/02/03 permanece bloqueada até White Space competitivo, qualidade da cidade-hub e demais gates executivos estarem completos.
                                </p>
                                {manifest.decisionBlockers.length > 0 && (
                                    <ul className="mt-3 grid gap-2 text-xs leading-5 text-slate-700 md:grid-cols-2">
                                        {manifest.decisionBlockers.map((blocker) => <li key={blocker} className="rounded-xl border border-amber-200/70 bg-white/70 p-3">• {blocker}</li>)}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </section>
                )}
                <TerritoryEconomicSimulator territories={territories} />
            </div>
        </div>
    );
}
