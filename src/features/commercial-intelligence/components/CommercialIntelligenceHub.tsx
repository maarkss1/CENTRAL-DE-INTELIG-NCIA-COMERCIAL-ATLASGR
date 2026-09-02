import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LineChart, SlidersHorizontal } from 'lucide-react';
import {
  commercialIntelligenceApi,
  currentMonth,
  type CommercialFilter,
  type FilterOptions,
} from '../commercialIntelligence.api';
import { SoundFX } from '../../../lib/soundEffects';
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

function FilterSelect({
  id,
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  allLabel: string;
  onChange: (next: string) => void;
}) {
  const withCurrent = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-40 rounded-xl border border-line bg-surface-2/75 px-3 py-2 text-sm font-medium text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[transform,border-color,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:border-brand/35 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <option value="">{allLabel}</option>
        {withCurrent.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </>
  );
}

export function CommercialIntelligenceHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    owners: [],
    products: [],
    sources: [],
    icps: [],
    companies: [],
  });

  useEffect(() => {
    let cancelled = false;
    commercialIntelligenceApi
      .filterOptions()
      .then((data) => !cancelled && setFilterOptions(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const tab = (searchParams.get('tab') as TabId) || 'overview';
  const month = searchParams.get('month') || currentMonth();
  const owner = searchParams.get('owner') || '';
  const product = searchParams.get('product') || '';
  const source = searchParams.get('source') || '';
  const icp = searchParams.get('icp') || '';
  const company = searchParams.get('company') || '';

  const filter: CommercialFilter = useMemo(
    () => ({
      month,
      owner: owner || undefined,
      product: product || undefined,
      source: source || undefined,
      icp: icp || undefined,
      company: company || undefined,
    }),
    [month, owner, product, source, icp, company],
  );

  const setTab = (next: TabId) => {
    SoundFX.play('navigate');
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

  const setFilter = (key: 'product' | 'source' | 'icp' | 'company', next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set(key, next);
    else params.delete(key);
    setSearchParams(params, { replace: true });
  };

  return (
    <main className="mx-auto w-full max-w-[92rem] flex-1 space-y-5 overflow-y-auto p-4 md:p-8">
      <header className="relative overflow-hidden rounded-[1.7rem] border border-line bg-surface/94 p-5 shadow-[0_30px_72px_-48px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.07)] md:p-6">
        <div
          className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-brand/10 blur-[90px]"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-brand/45 to-transparent"
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand-active shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:text-brand-2">
              <LineChart className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brand-active dark:text-brand-2">
                Revenue Command Center
              </p>
              <h1 className="mt-1 text-xl font-black tracking-tight text-ink md:text-2xl">
                Comercial Inteligente
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-2">
                Previsibilidade, pipeline, forecast e risco. Do volume aberto para o próximo
                movimento executivo.
              </p>
            </div>
          </div>

          <div className="flex max-w-4xl flex-wrap items-center gap-2">
            <div className="mr-1 hidden h-9 items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-3 text-[10px] font-black uppercase tracking-wider text-ink-2 2xl:flex">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> Recorte
            </div>
            <label className="sr-only" htmlFor="ci-month">
              Mês
            </label>
            <input
              id="ci-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || currentMonth())}
              className="rounded-xl border border-line bg-surface-2/75 px-3 py-2 text-sm font-medium text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[transform,border-color,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:border-brand/35 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            <FilterSelect
              id="ci-company"
              label="Empresa"
              value={company}
              options={filterOptions.companies}
              allLabel="Todas as empresas"
              onChange={(v) => setFilter('company', v)}
            />
            <FilterSelect
              id="ci-owner"
              label="Responsável"
              value={owner}
              options={filterOptions.owners}
              allLabel="Todos os vendedores"
              onChange={setOwner}
            />
            <FilterSelect
              id="ci-product"
              label="Produto"
              value={product}
              options={filterOptions.products}
              allLabel="Todos os produtos"
              onChange={(v) => setFilter('product', v)}
            />
            <FilterSelect
              id="ci-source"
              label="Origem"
              value={source}
              options={filterOptions.sources}
              allLabel="Todas as origens"
              onChange={(v) => setFilter('source', v)}
            />
            <FilterSelect
              id="ci-icp"
              label="ICP/Segmento"
              value={icp}
              options={filterOptions.icps}
              allLabel="Todos os segmentos"
              onChange={(v) => setFilter('icp', v)}
            />
          </div>
        </div>
      </header>

      <nav
        aria-label="Sub-áreas do Comercial Inteligente"
        className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface/84 p-1.5 shadow-[0_18px_45px_-38px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.05)]"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-[transform,background-color,color,box-shadow,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                active
                  ? 'border border-brand/20 bg-brand-active text-white shadow-[0_12px_28px_-18px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.16)]'
                  : 'border border-transparent text-ink-2 hover:-translate-y-0.5 hover:border-line hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="min-h-0">
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
