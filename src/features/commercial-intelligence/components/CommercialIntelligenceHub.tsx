import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LineChart } from 'lucide-react';
import { commercialIntelligenceApi, currentMonth, type CommercialFilter, type FilterOptions } from '../commercialIntelligence.api';
import { ExecutiveOverviewTab } from './ExecutiveOverviewTab';
import { PipelineForecastTab } from './PipelineForecastTab';
import { PerformanceTab } from './PerformanceTab';
import { LeadingIndicatorsTab } from './LeadingIndicatorsTab';
import { AgingTab } from './AgingTab';
import { LossesTab } from './LossesTab';
import { CrmQualityTab } from './CrmQualityTab';

const TABS = [
    { id: 'overview', label: 'Visão Executiva' },
    { id: 'pipeline', label: 'Pipeline & Forecast' },
    { id: 'performance', label: 'Performance' },
    { id: 'leading', label: 'Leading Indicators' },
    { id: 'aging', label: 'Aging' },
    { id: 'losses', label: 'Perdas' },
    { id: 'quality', label: 'Qualidade do CRM' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * Comercial Inteligente — Revenue Command Center executivo (módulo restrito a ADMIN/GESTOR, ver
 * `RequireRole` em `src/App.tsx` e `requireRole` em `commercialIntelligence.routes.ts`).
 *
 * Estrutura de "hub com abas internas" (não uma página por sub-área) — mesmo padrão já usado
 * neste repositório por `IntelligenceHub.tsx`/`ChatbookHub.tsx` para telas com múltiplas
 * sub-visões relacionadas, em vez de forçar 9 rotas/itens de menu separados só porque o prompt de
 * produto sugeriu essa estrutura como exemplo (ver `CLAUDE.md` seção 12.3: "componha a partir do
 * que existe"; a arquitetura de pastas sugerida na seção 35 do prompt de produto é explicitamente
 * condicional a "se o repositório não tiver um padrão definido" — este repositório tem).
 *
 * Filtros (mês + responsável) refletidos na URL via `useSearchParams` (seção 28 do prompt de
 * produto) — link compartilhável mantém o mesmo recorte.
 */
/**
 * Seletor de filtro carregado com valores reais (seção 18) — sempre inclui a opção atualmente
 * selecionada mesmo que `options` ainda não tenha carregado ou não a contenha mais (evita perder
 * silenciosamente o recorte de um link compartilhado enquanto a lista de opções está carregando).
 */
function FilterSelect({ id, label, value, options, allLabel, onChange }: { id: string; label: string; value: string; options: string[]; allLabel: string; onChange: (next: string) => void }) {
    const withCurrent = value && !options.includes(value) ? [value, ...options] : options;
    return (
        <>
            <label className="sr-only" htmlFor={id}>{label}</label>
            <select
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink w-36 transition-all hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
                <option value="">{allLabel}</option>
                {withCurrent.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        </>
    );
}

export function CommercialIntelligenceHub() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [filterOptions, setFilterOptions] = useState<FilterOptions>({ owners: [], products: [], sources: [], icps: [] });

    useEffect(() => {
        let cancelled = false;
        commercialIntelligenceApi.filterOptions().then((data) => !cancelled && setFilterOptions(data)).catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const tab = (searchParams.get('tab') as TabId) || 'overview';
    const month = searchParams.get('month') || currentMonth();
    const owner = searchParams.get('owner') || '';
    const product = searchParams.get('product') || '';
    const source = searchParams.get('source') || '';
    const icp = searchParams.get('icp') || '';

    const filter: CommercialFilter = useMemo(() => ({
        month,
        owner: owner || undefined,
        product: product || undefined,
        source: source || undefined,
        icp: icp || undefined,
    }), [month, owner, product, source, icp]);

    const setTab = (next: TabId) => {
        const params = new URLSearchParams(searchParams);
        params.set('tab', next);
        setSearchParams(params, { replace: true });
    };

    const setMonth = (next: string) => {
        const params = new URLSearchParams(searchParams);
        params.set('month', next);
        setSearchParams(params, { replace: true });
    };

    const setOwner = (next: string) => {
        const params = new URLSearchParams(searchParams);
        if (next) params.set('owner', next);
        else params.delete('owner');
        setSearchParams(params, { replace: true });
    };

    const setFilter = (key: 'product' | 'source' | 'icp', next: string) => {
        const params = new URLSearchParams(searchParams);
        if (next) params.set(key, next);
        else params.delete(key);
        setSearchParams(params, { replace: true });
    };

    return (
        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
            <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand shrink-0">
                        <LineChart className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-ink tracking-tight">Comercial Inteligente</h1>
                        <p className="text-sm text-ink-2 max-w-xl">
                            Previsibilidade, pipeline, forecast e risco — de &ldquo;quanto temos aberto?&rdquo; para &ldquo;quanto provavelmente venderemos, por que, e onde precisamos agir agora&rdquo;.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-4 md:mt-0">
                    <label className="sr-only" htmlFor="ci-month">Mês</label>
                    <input
                        id="ci-month"
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value || currentMonth())}
                        className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink transition-all hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                    <FilterSelect id="ci-owner" label="Responsável" value={owner} options={filterOptions.owners} allLabel="Todos os vendedores" onChange={setOwner} />
                    <FilterSelect id="ci-product" label="Produto" value={product} options={filterOptions.products} allLabel="Todos os produtos" onChange={(v) => setFilter('product', v)} />
                    <FilterSelect id="ci-source" label="Origem" value={source} options={filterOptions.sources} allLabel="Todas as origens" onChange={(v) => setFilter('source', v)} />
                    <FilterSelect id="ci-icp" label="ICP/Segmento" value={icp} options={filterOptions.icps} allLabel="Todos os segmentos" onChange={(v) => setFilter('icp', v)} />
                </div>
            </header>

            <nav aria-label="Sub-áreas do Comercial Inteligente" className="flex gap-1 overflow-x-auto border-b border-line pb-px">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        aria-current={tab === t.id ? 'page' : undefined}
                        className={`shrink-0 px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                            tab === t.id ? 'border-brand text-ink' : 'border-transparent text-ink-2 hover:text-ink'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </nav>

            <div>
                {tab === 'overview' && <ExecutiveOverviewTab filter={filter} />}
                {tab === 'pipeline' && <PipelineForecastTab filter={filter} />}
                {tab === 'performance' && <PerformanceTab filter={filter} />}
                {tab === 'leading' && <LeadingIndicatorsTab />}
                {tab === 'aging' && <AgingTab filter={filter} />}
                {tab === 'losses' && <LossesTab filter={filter} />}
                {tab === 'quality' && <CrmQualityTab filter={filter} />}
            </div>
        </main>
    );
}
