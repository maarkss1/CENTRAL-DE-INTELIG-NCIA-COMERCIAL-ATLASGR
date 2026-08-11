import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { commercialIntelligenceApi, type MetricDefinition } from '../commercialIntelligence.api';

/**
 * Cache em módulo — o dicionário de métricas é estático por sessão (não muda entre KPIs/telas),
 * então uma única chamada de rede serve todos os `MetricInfo` da página em vez de um fetch por
 * tile.
 */
let dictionaryPromise: Promise<MetricDefinition[]> | null = null;
function loadDictionary(): Promise<MetricDefinition[]> {
    if (!dictionaryPromise) {
        dictionaryPromise = commercialIntelligenceApi.metricsDictionary().catch((err) => {
            dictionaryPromise = null;
            throw err;
        });
    }
    return dictionaryPromise;
}

/**
 * Disclosure acessível (seção 39 do prompt de produto: tooltip acessível por métrica) usando
 * `<details>/<summary>` nativo — navegável por teclado e por leitor de tela sem JS adicional,
 * ao contrário de um tooltip que só abre no hover (débito de acessibilidade comum). Ver
 * `accessibility/SKILL.md`.
 */
export function MetricInfo({ metricKey }: { metricKey: string }) {
    const [definition, setDefinition] = useState<MetricDefinition | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open || definition) return;
        let cancelled = false;
        loadDictionary()
            .then((all) => {
                if (!cancelled) setDefinition(all.find((m) => m.key === metricKey) ?? null);
            })
            .catch(() => {
                if (!cancelled) setDefinition(null);
            });
        return () => {
            cancelled = true;
        };
    }, [open, definition, metricKey]);

    return (
        <details className="relative" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
            <summary
                className="list-none cursor-pointer text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-full p-0.5 [&::-webkit-details-marker]:hidden"
                aria-label="O que é esta métrica"
            >
                <Info className="w-3.5 h-3.5" aria-hidden="true" />
            </summary>
            <div className="absolute z-20 right-0 top-6 w-64 rounded-xl border border-line bg-surface shadow-card p-3 text-xs text-ink-2 space-y-1.5">
                {!definition ? (
                    <p>Carregando definição…</p>
                ) : (
                    <>
                        <p className="font-bold text-ink text-sm">{definition.name}</p>
                        <p>{definition.description}</p>
                        <p className="text-[11px]"><span className="font-semibold text-ink">Fórmula:</span> {definition.formula}</p>
                        <p className="text-[11px]"><span className="font-semibold text-ink">Fonte:</span> {definition.source}</p>
                        <p className="text-[11px]"><span className="font-semibold text-ink">Período:</span> {definition.period}</p>
                    </>
                )}
            </div>
        </details>
    );
}
