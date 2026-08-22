import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    AlertTriangle,
    BarChart3,
    Calculator,
    CheckCircle2,
    Clock,
    Database,
    FileSearch,
    Loader2,
    MapPinned,
    ShieldCheck,
    Target,
} from 'lucide-react';
import {
    type DatasetHealth,
    type MarketIntelligenceManifest,
    type MunicipalityRecord,
    type TerritoryRecord,
} from '../domain/MarketIntelligence';
import {
    calculateAllSellerScenarios,
    DEFAULT_RAMP,
    type CommercialScenario,
    type RevenueAssumptions,
    type SellerCostAssumptions,
} from '../domain/sellerEconomics';
import { loadMarketIntelligenceSnapshot } from '../marketIntelligence.data';

type TabId = 'board' | 'territories' | 'simulator' | 'data';

const TABS: Array<{ id: TabId; label: string; icon: typeof Target }> = [
    { id: 'board', label: 'Onde contratar agora?', icon: Target },
    { id: 'territories', label: 'Territórios', icon: MapPinned },
    { id: 'simulator', label: 'Simulador econômico', icon: Calculator },
    { id: 'data', label: 'Saúde dos Dados', icon: Database },
];

const EMPTY_COSTS: SellerCostAssumptions = {
    salary: 0,
    payrollCharges: 0,
    benefits: 0,
    vehicle: 0,
    fuel: 0,
    lodging: 0,
    tolls: 0,
    fixedCommission: 0,
    tools: 0,
    administration: 0,
};

const EMPTY_REVENUE: RevenueAssumptions = {
    averageMrrTicket: 0,
    grossMarginPct: 0,
    winRatePct: 0,
    meetingToQualifiedOpportunityPct: 0,
    monthlyChurnPct: 0,
    salesCycleDays: 0,
    fullProductivityQualifiedOpportunitiesPerMonth: 0,
    variableCommissionPctOfNewMrr: 0,
    samAccounts: null,
    penetrationPct: 0,
};

const SCENARIO_LABELS: Record<CommercialScenario, string> = {
    CONSERVADOR: 'Conservador',
    BASE: 'Base',
    AGRESSIVO: 'Agressivo',
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('pt-BR');

function statusTone(status: string) {
    if (status === 'ATUALIZADO') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (status === 'PARCIAL') return 'border-amber-200 bg-amber-50 text-amber-800';
    if (status === 'DESATUALIZADO') return 'border-rose-200 bg-rose-50 text-rose-700';
    return 'border-slate-200 bg-slate-50 text-slate-600';
}

// MI-006 (Sprint 04/Onda 16): os workflows de dados rodam mensalmente (ver `on.schedule` em
// market-intelligence-{cnpj,rntrc,fleet}.yml) — se o cron parar de disparar (falha silenciosa
// de agendamento, limite do GitHub Actions, etc.), o `status` gravado no manifest continua
// dizendo "ATUALIZADO" indefinidamente, porque é um valor estático escrito na última execução
// bem-sucedida, não recalculado a cada carregamento. Este limiar (mensal + buffer de ~50% para
// a janela real do cron, que roda todo dia 10) é calculado no cliente, a cada render, e nunca
// depende do pipeline continuar escrevendo algo nesse dataset específico.
const STALE_THRESHOLD_DAYS = 45;

function freshnessTimestamp(dataset: DatasetHealth): string | undefined {
    return dataset.downloadedAt ?? dataset.probedAt;
}

function isStale(dataset: DatasetHealth): boolean {
    const timestamp = freshnessTimestamp(dataset);
    if (!timestamp) return false;
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) return false;
    const ageMs = Date.now() - parsed.getTime();
    return ageMs > STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
}

function formatFreshness(dataset: DatasetHealth): string | null {
    const timestamp = freshnessTimestamp(dataset);
    if (!timestamp) return null;
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) return null;
    const label = dataset.downloadedAt ? 'Baixado' : 'Verificado';
    return `${label} ${formatDistanceToNow(parsed, { addSuffix: true, locale: ptBR })}`;
}

function DecisionBlocked({ manifest }: { manifest: MarketIntelligenceManifest }) {
    return (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 md:p-7" aria-labelledby="decision-blocked-title">
            <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-amber-100 p-2.5 text-amber-800"><AlertTriangle className="h-5 w-5" aria-hidden="true" /></div>
                <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-800">Decisão executiva bloqueada por governança</p>
                    <h2 id="decision-blocked-title" className="mt-1 text-xl font-black tracking-tight text-[#333333]">
                        Ainda não há evidência suficiente para nomear o vendedor 01.
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
                        O sistema não transforma ausência de dados em oportunidade. O ranking nacional só será liberado quando as camadas mínimas estiverem processadas e a confiança competitiva atender ao critério da metodologia.
                    </p>
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {manifest.decisionBlockers.map((blocker) => (
                            <div key={blocker} className="flex gap-2 rounded-xl border border-amber-200/70 bg-white/70 p-3 text-xs leading-5 text-slate-700">
                                <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5618]" aria-hidden="true" />
                                <span>{blocker}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

function BoardView({ manifest, territories }: { manifest: MarketIntelligenceManifest; territories: TerritoryRecord[] }) {
    const ranking = useMemo(
        () => [...territories].filter((item) => item.opportunityScore !== null).sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0)).slice(0, 5),
        [territories],
    );

    if (!manifest.decisionReady || ranking.length === 0) return <DecisionBlocked manifest={manifest} />;

    return (
        <section className="space-y-3" aria-labelledby="board-title">
            <div>
                {/* #A63810, não #FF5618 — mesmo padrão DQA-19: texto pequeno em laranja cru sobre
                    fundo claro só atinge ~3:1, abaixo do mínimo WCAG AA de 4.5:1 (achado real do
                    axe-core em accessibility.spec.ts). */}
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#A63810]">Board View</p>
                <h2 id="board-title" className="text-2xl font-black tracking-tight text-[#333333]">Top 5 territórios calculados</h2>
            </div>
            <div className="grid gap-3 xl:grid-cols-5">
                {ranking.map((territory, index) => (
                    <article key={territory.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <span className="text-4xl font-black tracking-tighter text-[#A63810]">#{index + 1}</span>
                        <h3 className="mt-3 text-lg font-black text-[#333333]">{territory.baseCity}/{territory.uf}</h3>
                        <p className="mt-1 text-xs text-slate-500">Raio {territory.radiusKm} km · {number.format(territory.municipalityCount)} municípios</p>
                        <dl className="mt-4 space-y-2 text-xs">
                            <div className="flex justify-between gap-2"><dt>Score</dt><dd className="font-black">{territory.opportunityScore?.toFixed(1)}</dd></div>
                            <div className="flex justify-between gap-2"><dt>SAM</dt><dd className="font-black">{territory.economics.samAccounts === null ? 'NÃO DISPONÍVEL' : number.format(territory.economics.samAccounts)}</dd></div>
                            <div className="flex justify-between gap-2"><dt>MRR potencial</dt><dd className="font-black">{territory.economics.potentialMrr === null ? 'PREMISSA PENDENTE' : money.format(territory.economics.potentialMrr)}</dd></div>
                            <div className="flex justify-between gap-2"><dt>Confiança</dt><dd className="font-black">{territory.confidence}</dd></div>
                        </dl>
                    </article>
                ))}
            </div>
        </section>
    );
}

function TopMunicipalitiesByDemand({ municipalities }: { municipalities: MunicipalityRecord[] }) {
    const ranked = useMemo(
        () => [...municipalities]
            .filter((row) => row.scores.demand.availability === 'OBSERVADO')
            .sort((a, b) => (b.scores.demand.value ?? 0) - (a.scores.demand.value ?? 0))
            .slice(0, 20),
        [municipalities],
    );

    if (!ranked.length) return null;

    return (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#A63810]">Componentes observados · Opportunity Score bloqueado</p>
                <h2 className="mt-1 text-lg font-black text-[#333333]">Top 20 municípios por demanda (ICP)</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Percentil nacional ponderado por tier ICP (A/B/C). Não é ranking de oportunidade — MDF-e, risco e concorrência ainda faltam para liberar o score final.</p>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                        <tr><th className="p-3">Município</th><th className="p-3">Demanda (percentil)</th><th className="p-3">Contas ICP</th><th className="p-3">Transportadores RNTRC</th><th className="p-3">Frota de carga (SENATRAN)</th></tr>
                    </thead>
                    <tbody>
                        {ranked.map((row) => (
                            <tr key={row.ibgeCode} className="border-t border-slate-100">
                                <td className="p-3 font-black text-[#333333]">{row.name}/{row.uf}</td>
                                <td className="p-3">{row.scores.demand.value?.toFixed(1)}</td>
                                <td className="p-3">{row.icp.total === null ? 'NÃO DISPONÍVEL' : number.format(row.icp.total)}</td>
                                <td className="p-3">{row.rntrc.transporters === null ? 'NÃO DISPONÍVEL' : number.format(row.rntrc.transporters)}</td>
                                <td className="p-3">{row.rntrc.activeVehicles === null ? 'NÃO DISPONÍVEL' : number.format(row.rntrc.activeVehicles)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function TerritoryView({ manifest, territories, municipalities }: { manifest: MarketIntelligenceManifest; territories: TerritoryRecord[]; municipalities: MunicipalityRecord[] }) {
    if (!territories.length) {
        return (
            <div className="space-y-3">
                <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center">
                    <MapPinned className="mx-auto h-9 w-9 text-[#FF5618]" aria-hidden="true" />
                    <h2 className="mt-3 text-xl font-black text-[#333333]">Territory Optimizer aguardando dados nacionais</h2>
                    <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                        Nenhum território calculado foi publicado no manifest atual. Quando os agregados municipais forem produzidos, esta visão receberá cenários de 1, 2, 3, 5, 10 e 20 vendedores com raios de 100 a 400 km e penalização de sobreposição.
                    </p>
                    <p className="mt-4 text-xs font-bold text-amber-700">Status: {manifest.decisionReady ? 'PRONTO' : 'BLOQUEADO POR DADOS'}</p>
                </section>
                <TopMunicipalitiesByDemand municipalities={municipalities} />
            </div>
        );
    }

    return (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-5"><h2 className="text-lg font-black text-[#333333]">Territórios calculados</h2></div>
            <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Base</th><th className="p-3">Raio</th><th className="p-3">Municípios</th><th className="p-3">ICP</th><th className="p-3">Score</th><th className="p-3">Confiança</th></tr></thead>
                    <tbody>{territories.map((territory) => <tr key={territory.id} className="border-t border-slate-100"><td className="p-3 font-black text-[#333333]">{territory.baseCity}/{territory.uf}</td><td className="p-3">{territory.radiusKm} km</td><td className="p-3">{number.format(territory.municipalityCount)}</td><td className="p-3">{territory.icp.total === null ? 'NÃO DISPONÍVEL' : number.format(territory.icp.total)}</td><td className="p-3">{territory.opportunityScore?.toFixed(1) ?? 'BLOQUEADO'}</td><td className="p-3 font-bold">{territory.confidence}</td></tr>)}</tbody>
                </table>
            </div>
        </section>
    );
}

function SellerSimulator() {
    const [costs, setCosts] = useState<SellerCostAssumptions>(EMPTY_COSTS);
    const [revenue, setRevenue] = useState<RevenueAssumptions>(EMPTY_REVENUE);
    const [scenario, setScenario] = useState<CommercialScenario>('BASE');

    const scenarios = useMemo(
        () => calculateAllSellerScenarios({ costs, revenue, ramp: DEFAULT_RAMP }),
        [costs, revenue],
    );
    const result = scenarios.find((item) => item.scenario === scenario) ?? scenarios[1];

    const costFields: Array<{ key: keyof SellerCostAssumptions; label: string }> = [
        { key: 'salary', label: 'Salário' }, { key: 'payrollCharges', label: 'Encargos' }, { key: 'benefits', label: 'Benefícios' },
        { key: 'vehicle', label: 'Veículo' }, { key: 'fuel', label: 'Combustível' }, { key: 'lodging', label: 'Hospedagem' },
        { key: 'tolls', label: 'Pedágio' }, { key: 'fixedCommission', label: 'Comissão fixa' }, { key: 'tools', label: 'Ferramentas' },
        { key: 'administration', label: 'Custo administrativo' },
    ];
    const revenueFields: Array<{ key: keyof Omit<RevenueAssumptions, 'samAccounts'>; label: string; suffix?: string }> = [
        { key: 'averageMrrTicket', label: 'Ticket MRR médio' },
        { key: 'grossMarginPct', label: 'Margem bruta', suffix: '%' },
        { key: 'winRatePct', label: 'Win Rate', suffix: '%' },
        { key: 'meetingToQualifiedOpportunityPct', label: 'Reunião → oportunidade qualificada', suffix: '%' },
        { key: 'penetrationPct', label: 'Penetração esperada no SAM', suffix: '%' },
        { key: 'monthlyChurnPct', label: 'Churn mensal', suffix: '%' },
        { key: 'salesCycleDays', label: 'Sales Cycle', suffix: 'dias' },
        { key: 'fullProductivityQualifiedOpportunitiesPerMonth', label: 'Oportunidades qualificadas/mês (produtividade plena)' },
        { key: 'variableCommissionPctOfNewMrr', label: 'Comissão variável sobre novo MRR', suffix: '%' },
    ];

    const updateCost = (key: keyof SellerCostAssumptions, value: string) => setCosts((current) => ({ ...current, [key]: Math.max(0, Number(value) || 0) }));
    const updateRevenue = (key: keyof Omit<RevenueAssumptions, 'samAccounts'>, value: string) => setRevenue((current) => ({ ...current, [key]: Math.max(0, Number(value) || 0) }));
    const updateSam = (value: string) => setRevenue((current) => ({ ...current, samAccounts: value.trim() === '' ? null : Math.max(0, Number(value) || 0) }));

    return (
        <section className="grid gap-4 xl:grid-cols-[1.4fr_.8fr]">
            <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
                    <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#A63810]">PREMISSA EDITÁVEL</p><h2 className="mt-1 text-xl font-black text-[#333333]">Custos fixos do vendedor</h2></div><Calculator className="h-6 w-6 text-[#FF5618]" aria-hidden="true" /></div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Os campos começam zerados deliberadamente. A plataforma não presume salário, ticket, margem ou win rate da Atlas.</p>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {costFields.map((field) => (
                            <label key={field.key} className="text-xs font-bold text-slate-600">
                                {field.label}
                                <div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:ring-2 focus-within:ring-[#FF5618]">
                                    <input aria-label={field.label} type="number" min="0" step="any" value={costs[field.key]} onChange={(event) => updateCost(field.key, event.target.value)} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-[#333333] outline-none" />
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
                    <h2 className="text-xl font-black text-[#333333]">Receita, funil e retenção</h2>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {revenueFields.map((field) => (
                            <label key={field.key} className="text-xs font-bold text-slate-600">
                                {field.label}
                                <div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:ring-2 focus-within:ring-[#FF5618]">
                                    <input aria-label={field.label} type="number" min="0" step="any" value={revenue[field.key]} onChange={(event) => updateRevenue(field.key, event.target.value)} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-[#333333] outline-none" />
                                    {field.suffix && <span className="ml-2 text-[10px] text-slate-400">{field.suffix}</span>}
                                </div>
                            </label>
                        ))}
                        <label className="text-xs font-bold text-slate-600">
                            Contas potenciais na região (SAM)
                            <div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:ring-2 focus-within:ring-[#FF5618]">
                                <input aria-label="Contas potenciais na região (SAM)" type="number" min="0" step="any" placeholder="NÃO DISPONÍVEL" value={revenue.samAccounts ?? ''} onChange={(event) => updateSam(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-[#333333] outline-none placeholder:text-slate-400" />
                            </div>
                        </label>
                    </div>
                </div>
            </div>
            <aside className="space-y-4">
                <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1.5">
                    {(['CONSERVADOR', 'BASE', 'AGRESSIVO'] as const).map((item) => (
                        // #A63810 = mesmo mix de 65% #FF5618 + preto usado em --color-brand-active
                        // (globals.css/DQA-19) — texto branco direto sobre #FF5618 só atinge ~3.2:1,
                        // abaixo do mínimo WCAG AA de 4.5:1 (achado real do axe-core).
                        <button key={item} type="button" onClick={() => setScenario(item)} aria-current={scenario === item ? 'true' : undefined} className={`flex-1 rounded-xl px-3 py-2 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5618] ${scenario === item ? 'bg-[#A63810] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                            {SCENARIO_LABELS[item]}
                        </button>
                    ))}
                </div>
                <div className="rounded-3xl bg-[#333333] p-6 text-white">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FFC500]">Resultado calculado · {SCENARIO_LABELS[result.scenario]}</p>
                    <dl className="mt-5 space-y-4">
                        <div><dt className="text-xs text-white/60">Custo fixo / mês</dt><dd className="mt-1 text-3xl font-black tracking-tight">{money.format(result.monthlyFixedCost)}</dd></div>
                        <div><dt className="text-xs text-white/60">Contribuição por contrato</dt><dd className="mt-1 text-xl font-black">{result.contributionPerContract === null ? 'NÃO CALCULÁVEL' : money.format(result.contributionPerContract)}</dd></div>
                        <div><dt className="text-xs text-white/60">Contratos para break-even</dt><dd className="mt-1 text-xl font-black">{result.breakEvenContracts ?? 'NÃO CALCULÁVEL'}</dd></div>
                        <div><dt className="text-xs text-white/60">MRR de break-even</dt><dd className="mt-1 text-xl font-black">{result.breakEvenMrr === null ? 'NÃO CALCULÁVEL' : money.format(result.breakEvenMrr)}</dd></div>
                        <div><dt className="text-xs text-white/60">Oportunidades qualificadas para break-even</dt><dd className="mt-1 text-xl font-black">{result.qualifiedOpportunitiesForBreakEven ?? 'NÃO CALCULÁVEL'}</dd></div>
                        <div><dt className="text-xs text-white/60">Reuniões para break-even</dt><dd className="mt-1 text-xl font-black">{result.meetingsForBreakEven ?? 'NÃO CALCULÁVEL'}</dd></div>
                        <div><dt className="text-xs text-white/60">Contratos máximos capturáveis (SAM × penetração)</dt><dd className="mt-1 text-xl font-black">{result.maximumCaptureContracts ?? 'NÃO DISPONÍVEL'}</dd></div>
                        <div><dt className="text-xs text-white/60">Payback</dt><dd className="mt-1 text-xl font-black">{result.paybackMonth === null ? 'NÃO ATINGIDO EM 24 MESES' : `Mês ${result.paybackMonth}`}</dd></div>
                        <div><dt className="text-xs text-white/60">ROI 12 / 24 meses</dt><dd className="mt-1 text-xl font-black">{result.roi12Pct === null ? 'NÃO CALCULÁVEL' : `${result.roi12Pct.toFixed(0)}%`} / {result.roi24Pct === null ? 'NÃO CALCULÁVEL' : `${result.roi24Pct.toFixed(0)}%`}</dd></div>
                        <div><dt className="text-xs text-white/60">MRR ao final do mês 12 / 24</dt><dd className="mt-1 text-xl font-black">{money.format(result.endingMrr12)} / {money.format(result.endingMrr24)}</dd></div>
                    </dl>
                </div>
            </aside>
        </section>
    );
}

function DataHealth({ manifest }: { manifest: MarketIntelligenceManifest }) {
    return (
        <section className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
                <div className="flex items-start gap-3"><ShieldCheck className="h-6 w-6 text-[#FF5618]" aria-hidden="true" /><div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#A63810]">Saúde dos Dados</p><h2 className="text-xl font-black text-[#333333]">Competência, cobertura e confiança antes do score</h2></div></div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {manifest.datasets.map((dataset) => {
                        const freshness = formatFreshness(dataset);
                        const stale = isStale(dataset);
                        return (
                            <article key={dataset.id} className="rounded-2xl border border-slate-200 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <h3 className="text-sm font-black text-[#333333]">{dataset.label}</h3>
                                    <div className="flex flex-col items-end gap-1">
                                        <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${statusTone(dataset.status)}`}>{dataset.status.replaceAll('_', ' ')}</span>
                                        {stale && (
                                            <span className="flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-700">
                                                <AlertTriangle className="h-3 w-3" aria-hidden="true" />DESATUALIZADO
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <dl className="mt-3 space-y-1 text-xs text-slate-600">
                                    <div><dt className="inline font-bold">Fonte: </dt><dd className="inline">{dataset.source ?? 'NÃO DISPONÍVEL'}</dd></div>
                                    <div><dt className="inline font-bold">Competência: </dt><dd className="inline">{dataset.competence ?? 'NÃO DISPONÍVEL'}</dd></div>
                                    <div><dt className="inline font-bold">Geografia: </dt><dd className="inline">{dataset.geography ?? 'NÃO DISPONÍVEL'}</dd></div>
                                    {typeof dataset.coverage === 'number' && <div><dt className="inline font-bold">Cobertura: </dt><dd className="inline">{number.format(dataset.coverage)}</dd></div>}
                                    {typeof dataset.unmatchedRate === 'number' && <div><dt className="inline font-bold">Qualidade: </dt><dd className="inline">{(1 - dataset.unmatchedRate).toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 2 })} de match ({number.format(dataset.unmatchedRows ?? 0)} rejeitados)</dd></div>}
                                    {dataset.taxonomyVersion && <div><dt className="inline font-bold">Taxonomia: </dt><dd className="inline">{dataset.taxonomyVersion}</dd></div>}
                                </dl>
                                {freshness && (
                                    <p className={`mt-3 flex items-center gap-1.5 text-xs font-bold ${stale ? 'text-rose-700' : 'text-slate-500'}`}>
                                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{freshness}
                                        {stale && ' — acima da cadência mensal esperada'}
                                    </p>
                                )}
                                {dataset.note && <p className="mt-3 text-xs leading-5 text-slate-500">{dataset.note}</p>}
                            </article>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

export function MarketIntelligenceApp() {
    const [tab, setTab] = useState<TabId>('board');
    const [manifest, setManifest] = useState<MarketIntelligenceManifest | null>(null);
    const [territories, setTerritories] = useState<TerritoryRecord[]>([]);
    const [municipalities, setMunicipalities] = useState<MunicipalityRecord[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        loadMarketIntelligenceSnapshot()
            .then((snapshot) => {
                if (!alive) return;
                setManifest(snapshot.manifest);
                setTerritories(snapshot.territories);
                setMunicipalities(snapshot.municipalities);
            })
            .catch((cause: unknown) => { if (!alive) return; setError(cause instanceof Error ? cause.message : 'Falha ao carregar Market Intelligence.'); });
        return () => { alive = false; };
    }, []);

    if (error) return <main className="flex-1 overflow-y-auto p-6"><div role="alert" className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800"><AlertTriangle className="mb-2 h-5 w-5" aria-hidden="true" />{error}</div></main>;
    if (!manifest) return <main className="flex flex-1 items-center justify-center"><div className="flex items-center gap-2 text-sm font-bold text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-[#FF5618]" aria-hidden="true" />Carregando inteligência territorial...</div></main>;

    return (
        <main className="flex-1 overflow-y-auto bg-[#F7F7F5] p-4 md:p-7">
            <div className="mx-auto w-full max-w-[1600px] space-y-5">
                <header className="relative overflow-hidden rounded-[28px] bg-[#333333] px-5 py-6 text-white md:px-8 md:py-8">
                    <div className="absolute inset-y-0 right-0 w-2 bg-[#FF5618]" aria-hidden="true" />
                    <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                        <div className="max-w-4xl">
                            <img src="/tools/atlas-market-intelligence/atlas-logo-negative.png" alt="Atlas GR" className="h-auto w-28" />
                            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-[#FFC500]">National Market & Territory Intelligence System</p>
                            <h1 className="mt-2 text-3xl font-black leading-tight tracking-[-0.04em] md:text-5xl">Onde a Atlas GR deve contratar o próximo vendedor?</h1>
                            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">Geointeligência, demanda, risco, logística, concorrência e unit economics com evidência rastreável. Sem converter lacuna de dados em certeza comercial.</p>
                        </div>
                        <div className={`rounded-2xl border px-4 py-3 ${manifest.decisionReady ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-[#FFC500]/30 bg-[#FFC500]/10'}`}>
                            <div className="flex items-center gap-2 text-xs font-black">{manifest.decisionReady ? <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 text-[#FFC500]" aria-hidden="true" />}{manifest.decisionReady ? 'DECISÃO PRONTA' : 'DECISÃO BLOQUEADA'}</div>
                            <p className="mt-1 text-[10px] text-white/60">Metodologia {manifest.methodologyVersion} · gerado {new Date(manifest.generatedAt).toLocaleString('pt-BR')}</p>
                        </div>
                    </div>
                </header>

                <nav aria-label="Módulos de Market Intelligence" className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5">
                    {/* #A63810 = mesmo mix de 65% #FF5618 + preto usado em --color-brand-active
                        (globals.css/DQA-19) — texto branco direto sobre #FF5618 só atinge ~3.2:1,
                        abaixo do mínimo WCAG AA de 4.5:1 (achado real do axe-core). */}
                    {TABS.map((item) => { const Icon = item.icon; const active = tab === item.id; return <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={active ? 'page' : undefined} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5618] ${active ? 'bg-[#A63810] text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-[#333333]'}`}><Icon className="h-4 w-4" aria-hidden="true" />{item.label}</button>; })}
                </nav>

                {tab === 'board' && <BoardView manifest={manifest} territories={territories} />}
                {tab === 'territories' && <TerritoryView manifest={manifest} territories={territories} municipalities={municipalities} />}
                {tab === 'simulator' && <SellerSimulator />}
                {tab === 'data' && <DataHealth manifest={manifest} />}

                <footer className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[10px] text-slate-500 md:flex-row md:items-center md:justify-between">
                    <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#FF5618]" aria-hidden="true" />Scores finais só aparecem quando o dataset e a confiança permitem.</span>
                    <span>Atlas GR · Market Intelligence</span>
                </footer>
            </div>
        </main>
    );
}
