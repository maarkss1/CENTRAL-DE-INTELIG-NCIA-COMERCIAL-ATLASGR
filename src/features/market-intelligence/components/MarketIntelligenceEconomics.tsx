import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
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
        return <div className="flex min-h-64 items-center justify-center"><div className="flex items-center gap-2 text-sm font-bold text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-[#FF5618]" aria-hidden="true" />Carregando unit economics territorial...</div></div>;
    }
    if (!manifest.decisionReady || !territories.length) {
        return (
            <div className="m-4 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 md:m-7">
                <AlertTriangle className="mb-2 h-5 w-5" aria-hidden="true" />
                <p className="font-black">Unit economics bloqueado até existir ranking territorial válido.</p>
                {manifest.decisionBlockers.length > 0 && <ul className="mt-3 space-y-1">{manifest.decisionBlockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}</ul>}
            </div>
        );
    }

    return <div className="bg-[#F7F7F5] p-4 md:p-7"><div className="mx-auto w-full max-w-[1600px]"><TerritoryEconomicSimulator territories={territories} /></div></div>;
}
