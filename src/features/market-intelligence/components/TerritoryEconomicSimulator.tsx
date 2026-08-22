import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Calculator,
    CheckCircle2,
    CircleDollarSign,
    Database,
    Loader2,
    MapPinned,
    ShieldCheck,
} from 'lucide-react';
import { commercialIntelligenceApi } from '../../commercial-intelligence/commercialIntelligence.api';
import type { TerritoryRecord } from '../domain/MarketIntelligence';
import {
    calibrateSellerEconomicsFromHistory,
    currentBrasiliaMonth,
    type CrmEconomicCalibration,
} from '../domain/crmEconomicCalibration';
import {
    DEFAULT_RAMP,
    type CommercialScenario,
    type RevenueAssumptions,
    type SellerCostAssumptions,
    type SellerModelAssumptions,
} from '../domain/sellerEconomics';
import {
    assessTerritoryEconomics,
    compareTerritoryEconomics,
    type EconomicDecisionPolicy,
    type EconomicRecommendation,
} from '../domain/territoryEconomics';

interface Props {
    territories: TerritoryRecord[];
}

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

const EMPTY_POLICY: EconomicDecisionPolicy = {
    maxPaybackMonths: null,
    minRoi12Pct: null,
    minRoi24Pct: null,
};

const SCENARIO_LABELS: Record<CommercialScenario, string> = {
    CONSERVADOR: 'Conservador',
    BASE: 'Base',
    AGRESSIVO: 'Agressivo',
};

const RECOMMENDATION_LABEL: Record<EconomicRecommendation, string> = {
    PREMISSAS_PENDENTES: 'PREMISSAS PENDENTES',
    POLITICA_PENDENTE: 'POLÍTICA PENDENTE',
    RECOMENDADO: 'CONTRATAÇÃO RECOMENDADA',
    NAO_RECOMENDADO: 'NÃO RECOMENDADO',
};

const CALIBRATION_TONE: Record<CrmEconomicCalibration['quality'], string> = {
    INSUFICIENTE: 'border-amber-200 bg-amber-50 text-amber-800',
    BAIXA: 'border-amber-200 bg-amber-50 text-amber-800',
    MEDIA: 'border-sky-200 bg-sky-50 text-sky-800',
    ALTA: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function nullableNumber(value: string): number | null {
    if (value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function recommendationTone(recommendation: EconomicRecommendation): string {
    if (recommendation === 'RECOMENDADO') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
    if (recommendation === 'NAO_RECOMENDADO') return 'border-rose-300 bg-rose-50 text-rose-800';
    return 'border-amber-300 bg-amber-50 text-amber-800';
}

function rounded(value: number | null): number | null {
    return value === null ? null : Math.round(value * 100) / 100;
}

export function TerritoryEconomicSimulator({ territories }: Props) {
    const [selectedTerritoryId, setSelectedTerritoryId] = useState(territories[0]?.id ?? '');
    const [costs, setCosts] = useState<SellerCostAssumptions>(EMPTY_COSTS);
    const [revenue, setRevenue] = useState<RevenueAssumptions>(EMPTY_REVENUE);
    const [upfrontInvestment, setUpfrontInvestment] = useState(0);
    const [serviceableSharePct, setServiceableSharePct] = useState(0);
    const [policy, setPolicy] = useState<EconomicDecisionPolicy>(EMPTY_POLICY);
    const [scenario, setScenario] = useState<CommercialScenario>('BASE');
    const [crmCalibration, setCrmCalibration] = useState<CrmEconomicCalibration | null>(null);
    const [calibrationLoading, setCalibrationLoading] = useState(true);
    const [calibrationError, setCalibrationError] = useState<string | null>(null);
    const [calibrationApplied, setCalibrationApplied] = useState(false);

    useEffect(() => {
        if (!territories.length) return;
        if (!territories.some((territory) => territory.id === selectedTerritoryId)) {
            setSelectedTerritoryId(territories[0].id);
        }
    }, [selectedTerritoryId, territories]);

    useEffect(() => {
        let alive = true;
        setCalibrationLoading(true);
        commercialIntelligenceApi.trends({ month: currentBrasiliaMonth() })
            .then((report) => {
                if (!alive) return;
                setCrmCalibration(calibrateSellerEconomicsFromHistory(report.points));
                setCalibrationError(null);
            })
            .catch((cause: unknown) => {
                if (!alive) return;
                setCrmCalibration(null);
                setCalibrationError(cause instanceof Error ? cause.message : 'Falha ao ler o histórico do Comercial Inteligente.');
            })
            .finally(() => {
                if (alive) setCalibrationLoading(false);
            });
        return () => { alive = false; };
    }, []);

    const selectedTerritory = territories.find((territory) => territory.id === selectedTerritoryId) ?? territories[0];
    const model = useMemo<SellerModelAssumptions>(() => ({
        costs,
        revenue,
        ramp: DEFAULT_RAMP,
        upfrontInvestment,
    }), [costs, revenue, upfrontInvestment]);

    const assessment = useMemo(
        () => selectedTerritory
            ? assessTerritoryEconomics(selectedTerritory, { serviceableSharePct }, model, policy, scenario)
            : null,
        [model, policy, scenario, selectedTerritory, serviceableSharePct],
    );

    const comparison = useMemo(
        () => compareTerritoryEconomics(territories.slice(0, 5), { serviceableSharePct }, model, policy, scenario),
        [model, policy, scenario, serviceableSharePct, territories],
    );

    if (!selectedTerritory || !assessment) {
        return (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-7 text-sm text-amber-800">
                <AlertTriangle className="mb-2 h-5 w-5" aria-hidden="true" />
                O simulador econômico aguarda ao menos um território materializado.
            </section>
        );
    }

    const costFields: Array<{ key: keyof SellerCostAssumptions; label: string }> = [
        { key: 'salary', label: 'Salário' },
        { key: 'payrollCharges', label: 'Encargos' },
        { key: 'benefits', label: 'Benefícios' },
        { key: 'vehicle', label: 'Veículo' },
        { key: 'fuel', label: 'Combustível' },
        { key: 'lodging', label: 'Hospedagem' },
        { key: 'tolls', label: 'Pedágio' },
        { key: 'fixedCommission', label: 'Comissão fixa' },
        { key: 'tools', label: 'Ferramentas' },
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
        { key: 'fullProductivityQualifiedOpportunitiesPerMonth', label: 'Oportunidades qualificadas/mês em produtividade plena' },
        { key: 'variableCommissionPctOfNewMrr', label: 'Comissão variável sobre novo MRR', suffix: '%' },
    ];

    const updateCost = (key: keyof SellerCostAssumptions, value: string) => {
        setCosts((current) => ({ ...current, [key]: Math.max(0, Number(value) || 0) }));
    };
    const updateRevenue = (key: keyof Omit<RevenueAssumptions, 'samAccounts'>, value: string) => {
        setRevenue((current) => ({ ...current, [key]: Math.max(0, Number(value) || 0) }));
        if (key === 'averageMrrTicket' || key === 'winRatePct' || key === 'salesCycleDays') setCalibrationApplied(false);
    };
    const applyCrmCalibration = () => {
        if (!crmCalibration?.eligible) return;
        const calibrated = crmCalibration.recommended;
        setRevenue((current) => ({
            ...current,
            averageMrrTicket: rounded(calibrated.averageMrrTicket) ?? current.averageMrrTicket,
            winRatePct: rounded(calibrated.winRatePct) ?? current.winRatePct,
            salesCycleDays: rounded(calibrated.salesCycleDays) ?? current.salesCycleDays,
        }));
        setCalibrationApplied(true);
    };

    const issues = assessment.blockers.length ? assessment.blockers : assessment.failedPolicyRules;

    return (
        <section className="space-y-4" aria-labelledby="territory-economics-title">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FF5618]">Unit Economics territorial · v1.3</p>
                        <h2 id="territory-economics-title" className="mt-1 text-2xl font-black tracking-tight text-[#333333]">O território paga a contratação?</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">O mapa define o TAM ICP observado. O CRM pode calibrar ticket ganho, Win Rate e Sales Cycle com histórico real. SAM, margem, custos, capacidade e política financeira continuam explícitos.</p>
                    </div>
                    <label className="min-w-[280px] text-xs font-bold text-slate-600">
                        Território analisado
                        <select aria-label="Território analisado" value={selectedTerritory.id} onChange={(event) => setSelectedTerritoryId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-[#333333] outline-none focus:ring-2 focus:ring-[#FF5618]">
                            {territories.map((territory, index) => (
                                <option key={territory.id} value={territory.id}>#{index + 1} {territory.baseCity}/{territory.uf} · {territory.radiusKm} km</option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-4">
                    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><MapPinned className="h-4 w-4 text-[#FF5618]" aria-hidden="true" /><p className="mt-2 text-[10px] font-black uppercase text-slate-500">Prioridade territorial</p><p className="mt-1 text-xl font-black text-[#333333]">{selectedTerritory.opportunityScore?.toFixed(1) ?? 'N/A'}</p><p className="text-xs text-slate-500">Confiança {selectedTerritory.confidence}</p></article>
                    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><ShieldCheck className="h-4 w-4 text-[#FF5618]" aria-hidden="true" /><p className="mt-2 text-[10px] font-black uppercase text-slate-500">TAM ICP observado</p><p className="mt-1 text-xl font-black text-[#333333]">{assessment.tamAccounts === null ? 'N/A' : integer.format(assessment.tamAccounts)}</p><p className="text-xs text-slate-500">Não é SAM automático</p></article>
                    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><Calculator className="h-4 w-4 text-[#FF5618]" aria-hidden="true" /><p className="mt-2 text-[10px] font-black uppercase text-slate-500">SAM derivado</p><p className="mt-1 text-xl font-black text-[#333333]">{assessment.samAccounts === null ? 'PENDENTE' : integer.format(assessment.samAccounts)}</p><p className="text-xs text-slate-500">TAM × % atendível</p></article>
                    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><CircleDollarSign className="h-4 w-4 text-[#FF5618]" aria-hidden="true" /><p className="mt-2 text-[10px] font-black uppercase text-slate-500">SOM máximo</p><p className="mt-1 text-xl font-black text-[#333333]">{assessment.economics.maximumCaptureContracts ?? 'PENDENTE'}</p><p className="text-xs text-slate-500">SAM × penetração</p></article>
                </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7" aria-label="Calibração CRM">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-3">
                        <div className="rounded-2xl bg-slate-100 p-2.5 text-[#FF5618]"><Database className="h-5 w-5" aria-hidden="true" /></div>
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FF5618]">Calibração CRM · 6 meses</p>
                            <h3 className="mt-1 text-lg font-black text-[#333333]">Use o histórico real antes de digitar premissas comerciais</h3>
                            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Fonte canônica: Comercial Inteligente / negócios fechados. A aplicação é manual e rastreável. Margem, churn, conversão reunião→oportunidade, produtividade e penetração não são preenchidos por esta calibração.</p>
                        </div>
                    </div>
                    {calibrationLoading ? (
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Lendo CRM...</span>
                    ) : crmCalibration ? (
                        <span className={`rounded-full border px-3 py-2 text-xs font-black ${CALIBRATION_TONE[crmCalibration.quality]}`}>CONFIANÇA {crmCalibration.quality}</span>
                    ) : null}
                </div>

                {calibrationError && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">CRM indisponível para calibração: {calibrationError}. O simulador continua utilizável com premissas manuais.</div>}
                {crmCalibration && (
                    <div className="mt-5 space-y-4">
                        <div className="grid gap-3 md:grid-cols-4">
                            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase text-slate-500">Amostra</p><p className="mt-1 text-xl font-black">{integer.format(crmCalibration.totalClosedSample)}</p><p className="text-xs text-slate-500">negócios fechados · {crmCalibration.monthsWithClosedSample} meses</p></article>
                            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase text-slate-500">Ticket ganho calibrado</p><p className="mt-1 text-xl font-black">{crmCalibration.recommended.averageMrrTicket === null ? 'N/A' : money.format(crmCalibration.recommended.averageMrrTicket)}</p><p className="text-xs text-slate-500">mediana dos tickets médios mensais</p></article>
                            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase text-slate-500">Win Rate calibrado</p><p className="mt-1 text-xl font-black">{crmCalibration.recommended.winRatePct === null ? 'N/A' : `${decimal.format(crmCalibration.recommended.winRatePct)}%`}</p><p className="text-xs text-slate-500">ponderado por fechamentos</p></article>
                            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase text-slate-500">Sales Cycle calibrado</p><p className="mt-1 text-xl font-black">{crmCalibration.recommended.salesCycleDays === null ? 'N/A' : `${decimal.format(crmCalibration.recommended.salesCycleDays)} dias`}</p><p className="text-xs text-slate-500">ponderado por fechamentos</p></article>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-xs text-slate-500">
                                Período: <strong>{crmCalibration.fromPeriod ?? 'N/A'} → {crmCalibration.toPeriod ?? 'N/A'}</strong>
                                {calibrationApplied && <span className="ml-2 font-black text-emerald-700">✓ aplicado ao cenário atual</span>}
                            </div>
                            <button type="button" aria-label="Aplicar dados do CRM" disabled={!crmCalibration.eligible} onClick={applyCrmCalibration} className="rounded-xl bg-[#333333] px-4 py-2.5 text-xs font-black text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">Aplicar dados do CRM</button>
                        </div>
                        {!crmCalibration.eligible && crmCalibration.blockers.length > 0 && <ul className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">{crmCalibration.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}</ul>}
                    </div>
                )}
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.35fr_.85fr]">
                <div className="space-y-4">
                    <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
                        <h3 className="text-lg font-black text-[#333333]">Mercado atendível e investimento inicial</h3>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <label className="text-xs font-bold text-slate-600">ICP territorial realmente atendível<div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3"><input aria-label="ICP territorial realmente atendível" type="number" min="0" max="100" step="any" value={serviceableSharePct} onChange={(event) => setServiceableSharePct(Math.max(0, Number(event.target.value) || 0))} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" /><span className="text-[10px] text-slate-400">%</span></div></label>
                            <label className="text-xs font-bold text-slate-600">Investimento inicial<div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3"><input aria-label="Investimento inicial" type="number" min="0" step="any" value={upfrontInvestment} onChange={(event) => setUpfrontInvestment(Math.max(0, Number(event.target.value) || 0))} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" /></div><span className="mt-1 block text-[10px] font-normal text-slate-400">Recrutamento, onboarding, equipamento e outros custos únicos.</span></label>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
                        <h3 className="text-lg font-black text-[#333333]">Custos mensais do vendedor</h3>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {costFields.map((field) => <label key={field.key} className="text-xs font-bold text-slate-600">{field.label}<div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3"><input aria-label={field.label} type="number" min="0" step="any" value={costs[field.key]} onChange={(event) => updateCost(field.key, event.target.value)} className="w-full bg-transparent py-2.5 text-sm outline-none" /></div></label>)}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
                        <h3 className="text-lg font-black text-[#333333]">Receita, funil e retenção</h3>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {revenueFields.map((field) => <label key={field.key} className="text-xs font-bold text-slate-600">{field.label}<div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3"><input aria-label={field.label} type="number" min="0" step="any" value={revenue[field.key]} onChange={(event) => updateRevenue(field.key, event.target.value)} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" />{field.suffix && <span className="ml-2 text-[10px] text-slate-400">{field.suffix}</span>}</div></label>)}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
                        <h3 className="text-lg font-black text-[#333333]">Política para autorizar a contratação</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">Sem política explícita, o sistema calcula os números, mas não emite “recomendado”.</p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <label className="text-xs font-bold text-slate-600">Payback máximo<div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3"><input aria-label="Payback máximo" type="number" min="1" step="1" placeholder="PENDENTE" value={policy.maxPaybackMonths ?? ''} onChange={(event) => setPolicy((current) => ({ ...current, maxPaybackMonths: nullableNumber(event.target.value) }))} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400" /><span className="text-[10px] text-slate-400">meses</span></div></label>
                            <label className="text-xs font-bold text-slate-600">ROI mínimo em 12 meses<div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3"><input aria-label="ROI mínimo em 12 meses" type="number" step="any" placeholder="PENDENTE" value={policy.minRoi12Pct ?? ''} onChange={(event) => setPolicy((current) => ({ ...current, minRoi12Pct: nullableNumber(event.target.value) }))} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400" /><span className="text-[10px] text-slate-400">%</span></div></label>
                            <label className="text-xs font-bold text-slate-600">ROI mínimo em 24 meses (opcional)<div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3"><input aria-label="ROI mínimo em 24 meses" type="number" step="any" placeholder="OPCIONAL" value={policy.minRoi24Pct ?? ''} onChange={(event) => setPolicy((current) => ({ ...current, minRoi24Pct: nullableNumber(event.target.value) }))} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400" /><span className="text-[10px] text-slate-400">%</span></div></label>
                        </div>
                    </div>
                </div>

                <aside className="space-y-4">
                    <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1.5">
                        {(['CONSERVADOR', 'BASE', 'AGRESSIVO'] as const).map((item) => <button key={item} type="button" onClick={() => setScenario(item)} aria-current={scenario === item ? 'true' : undefined} className={`flex-1 rounded-xl px-3 py-2 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5618] ${scenario === item ? 'bg-brand-active text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{SCENARIO_LABELS[item]}</button>)}
                    </div>

                    <div className={`rounded-3xl border p-5 ${recommendationTone(assessment.recommendation)}`}>
                        <div className="flex items-center gap-2">{assessment.recommendation === 'RECOMENDADO' ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5" aria-hidden="true" />}<p className="text-xs font-black">{RECOMMENDATION_LABEL[assessment.recommendation]}</p></div>
                        <p className="mt-2 text-sm font-bold">{selectedTerritory.baseCity}/{selectedTerritory.uf} · cenário {SCENARIO_LABELS[scenario]}</p>
                        {issues.length > 0 && <ul className="mt-3 space-y-1 text-xs leading-5">{issues.map((issue) => <li key={issue}>• {issue}</li>)}</ul>}
                    </div>

                    <div className="rounded-3xl bg-[#333333] p-6 text-white">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FFC500]">Unit economics · {SCENARIO_LABELS[scenario]}</p>
                        <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                            <div><dt className="text-xs text-white/60">Investimento inicial</dt><dd className="mt-1 text-xl font-black">{money.format(assessment.economics.upfrontInvestment)}</dd></div>
                            <div><dt className="text-xs text-white/60">Custo fixo / mês</dt><dd className="mt-1 text-2xl font-black">{money.format(assessment.economics.monthlyFixedCost)}</dd></div>
                            <div><dt className="text-xs text-white/60">Contratos para break-even mensal</dt><dd className="mt-1 text-xl font-black">{assessment.economics.breakEvenContracts ?? 'NÃO CALCULÁVEL'}</dd></div>
                            <div><dt className="text-xs text-white/60">Pipeline MRR para break-even</dt><dd className="mt-1 text-xl font-black">{assessment.economics.pipelineMrrForBreakEven === null ? 'NÃO CALCULÁVEL' : money.format(assessment.economics.pipelineMrrForBreakEven)}</dd></div>
                            <div><dt className="text-xs text-white/60">Reuniões para break-even</dt><dd className="mt-1 text-xl font-black">{assessment.economics.meetingsForBreakEven ?? 'NÃO CALCULÁVEL'}</dd></div>
                            <div><dt className="text-xs text-white/60">Payback</dt><dd className="mt-1 text-xl font-black">{assessment.economics.paybackMonth === null ? 'NÃO ATINGIDO EM 24 MESES' : `Mês ${assessment.economics.paybackMonth}`}</dd></div>
                            <div><dt className="text-xs text-white/60">ROI 12 / 24 meses</dt><dd className="mt-1 text-xl font-black">{assessment.economics.roi12Pct === null ? 'N/A' : `${assessment.economics.roi12Pct.toFixed(0)}%`} / {assessment.economics.roi24Pct === null ? 'N/A' : `${assessment.economics.roi24Pct.toFixed(0)}%`}</dd></div>
                            <div><dt className="text-xs text-white/60">MRR mês 12 / 24</dt><dd className="mt-1 text-xl font-black">{money.format(assessment.economics.endingMrr12)} / {money.format(assessment.economics.endingMrr24)}</dd></div>
                        </dl>
                    </div>
                </aside>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 p-5"><h3 className="text-lg font-black text-[#333333]">Comparação econômica · Top 5 territorial</h3><p className="mt-1 text-xs text-slate-500">Custos e funil são mantidos iguais; cada território altera TAM, SAM, SOM e o desempate final pelo Opportunity Score.</p></div>
                <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Território</th><th className="p-3">Score</th><th className="p-3">TAM</th><th className="p-3">SAM</th><th className="p-3">Payback</th><th className="p-3">ROI 12m</th><th className="p-3">Veredito</th></tr></thead><tbody>{comparison.map((item) => <tr key={item.territoryId} className="border-t border-slate-100"><td className="p-3 font-black text-[#333333]">{item.baseCity}/{item.uf}</td><td className="p-3">{item.opportunityScore?.toFixed(1) ?? 'N/A'}</td><td className="p-3">{item.tamAccounts === null ? 'N/A' : integer.format(item.tamAccounts)}</td><td className="p-3">{item.samAccounts === null ? 'PENDENTE' : integer.format(item.samAccounts)}</td><td className="p-3">{item.economics.paybackMonth === null ? 'N/A' : `${item.economics.paybackMonth}m`}</td><td className="p-3">{item.economics.roi12Pct === null ? 'N/A' : `${item.economics.roi12Pct.toFixed(0)}%`}</td><td className="p-3 font-black">{RECOMMENDATION_LABEL[item.recommendation]}</td></tr>)}</tbody></table></div>
            </div>
        </section>
    );
}
