import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import {
    marketIntelligenceApi,
    type CompanyFilters,
    type MarketCompanyDetail,
    type MarketCompanyListResult,
    type MarketTerritory,
} from '../marketIntelligence.api';

const number = new Intl.NumberFormat('pt-BR');
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const INITIAL_FILTERS: CompanyFilters = { uf: 'SP', municipioIbge: '3543402', situacaoCadastral: 'ATIVA' };

function available(value: unknown): string {
    return value === null || value === undefined || value === '' ? 'NÃO DISPONÍVEL' : String(value);
}

function badge(value: string | null) {
    if (value === 'ATIVA' || value === 'MUITO_ALTO' || value === 'ALTO') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (!value) return 'border-slate-200 bg-slate-50 text-slate-500';
    return 'border-amber-200 bg-amber-50 text-amber-800';
}

function DetailPanel({ detail, onClose }: { detail: MarketCompanyDetail; onClose: () => void }) {
    const address = [detail.address.tipoLogradouro, detail.address.logradouro, detail.address.numero,
        detail.address.complemento, detail.address.bairro].filter(Boolean).join(', ');
    const phone = [detail.contact.ddd1, detail.contact.telefone1].filter(Boolean).join(' ');
    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/35" role="dialog" aria-modal="true" aria-labelledby="company-detail-title">
            <button type="button" aria-label="Fechar detalhe" className="absolute inset-0 cursor-default" onClick={onClose} />
            <aside className="relative h-full w-full max-w-2xl overflow-y-auto bg-[#F7F7F5] p-5 shadow-2xl md:p-7">
                <div className="flex items-start justify-between gap-4">
                    <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-brand">Empresa observada</p>
                        <h2 id="company-detail-title" className="mt-1 text-2xl font-black text-[#333333]">{detail.razaoSocial}</h2>
                        <p className="mt-1 text-sm text-slate-500">{detail.cnpj} · {available(detail.nomeFantasia)}</p></div>
                    <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 focus-visible:ring-2 focus-visible:ring-brand"><X className="h-5 w-5" /></button>
                </div>
                <div className="mt-5 grid gap-4">
                    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-black text-[#333333]">Identificação</h3>
                        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Situação</dt><dd className="font-bold">{available(detail.situacaoCadastral)}</dd></div><div><dt className="text-slate-500">Matriz/filial</dt><dd className="font-bold">{available(detail.matrizFilial)}</dd></div><div><dt className="text-slate-500">Início de atividade</dt><dd className="font-bold">{available(detail.datas.inicioAtividade?.slice(0, 10))}</dd></div><div><dt className="text-slate-500">Natureza jurídica</dt><dd className="font-bold">{available(detail.naturezaJuridica.description)}</dd></div></dl>
                    </section>
                    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-black text-[#333333]">Atividade e perfil</h3>
                        <p className="mt-3 text-sm"><strong>{available(detail.cnae.principal.code)}</strong> · {available(detail.cnae.principal.description)}</p>
                        <p className="mt-2 text-xs text-slate-500">CNAEs secundários: {detail.cnae.secundarios.length ? detail.cnae.secundarios.map((item) => item.code).join(', ') : 'NÃO DISPONÍVEL'}</p>
                        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><div><dt className="text-slate-500">Porte</dt><dd className="font-bold">{available(detail.porte)}</dd></div><div><dt className="text-slate-500">Capital social</dt><dd className="font-bold">{detail.capitalSocial == null ? 'NÃO DISPONÍVEL' : money.format(detail.capitalSocial)}</dd></div><div><dt className="text-slate-500">Simples / MEI</dt><dd className="font-bold">{available(detail.simples.option)} / {available(detail.mei.option)}</dd></div></dl>
                    </section>
                    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-black text-[#333333]">Localização e contato público</h3>
                        <p className="mt-3 text-sm">{available(address)}<br />{available(detail.address.municipioNome)}/{available(detail.address.uf)} · CEP {available(detail.address.cep)}</p>
                        <p className="mt-3 text-sm">Telefone: {available(phone)}<br />E-mail: {available(detail.contact.email)}</p>
                        <p className="mt-2 text-[10px] font-bold text-amber-700">Dado cadastral público; não significa contato comercial validado.</p>
                    </section>
                    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-black text-[#333333]">Inteligência AtlasGR</h3>
                        {detail.icp ? <div className="mt-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${badge(detail.icp.tier)}`}>{detail.icp.tier.replaceAll('_', ' ')}</span><p className="mt-3 text-sm">Score: {available(detail.icp.score)} · modelo {available(detail.icp.taxonomyVersion)} · {detail.icp.dataOrigin}</p>{detail.icp.reasons.length ? <ul className="mt-3 space-y-2">{detail.icp.reasons.map((reason, index) => <li key={`${reason.factor ?? 'fator'}-${index}`} className="rounded-xl bg-slate-50 p-3 text-xs"><strong>{available(reason.factor)}</strong>{reason.impact == null ? '' : ` · impacto ${reason.impact}`}<br /><span className="text-slate-600">{available(reason.message ?? reason.value)}</span></li>)}</ul> : <p className="mt-2 text-xs text-slate-500">Motivos estruturados não disponíveis.</p>}</div> : <p className="mt-3 text-sm text-slate-500">ICP NÃO DISPONÍVEL — nenhuma classificação foi inventada.</p>}
                        <p className="mt-3 text-sm text-slate-500">RNTRC empresarial: {detail.rntrc ? available(detail.rntrc.status) : 'NÃO DISPONÍVEL — indicador municipal não foi atribuído à empresa.'}</p>
                    </section>
                    <section className="rounded-2xl bg-[#333333] p-5 text-white"><h3 className="font-black">Proveniência</h3>
                        <dl className="mt-3 grid gap-2 text-xs text-white/70 sm:grid-cols-2"><div><dt>Fonte</dt><dd className="font-bold text-white">{detail.provenance.source}</dd></div><div><dt>Competência</dt><dd className="font-bold text-white">{detail.provenance.competencia}</dd></div><div><dt>Origem</dt><dd className="font-bold text-white">{detail.provenance.dataOrigin}</dd></div><div><dt>Hash</dt><dd className="truncate font-mono text-[10px] text-white">{detail.provenance.datasetHash}</dd></div></dl>
                    </section>
                </div>
            </aside>
        </div>
    );
}

export function CompanyExplorer() {
    const [draft, setDraft] = useState<CompanyFilters>(INITIAL_FILTERS);
    const [filters, setFilters] = useState<CompanyFilters>(INITIAL_FILTERS);
    const [page, setPage] = useState(1);
    const [result, setResult] = useState<MarketCompanyListResult | null>(null);
    const [territories, setTerritories] = useState<MarketTerritory[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detail, setDetail] = useState<MarketCompanyDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        marketIntelligenceApi.territories(draft.uf, controller.signal)
            .then((response) => setTerritories(response.data))
            .catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); });
        return () => controller.abort();
    }, [draft.uf]);

    useEffect(() => {
        const controller = new AbortController();
        setError(null);
        setRefreshing(true);
        marketIntelligenceApi.companies(filters, page, 50, controller.signal)
            .then(setResult)
            .catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); })
            .finally(() => { if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); } });
        return () => controller.abort();
    }, [filters, page]);

    const selectedTerritory = useMemo(
        () => territories.find((item) => item.municipioIbge === draft.municipioIbge),
        [draft.municipioIbge, territories],
    );

    const apply = () => { setPage(1); setFilters({ ...draft }); };
    const openDetail = async (cnpj: string) => {
        setDetailLoading(true); setError(null);
        try { setDetail(await marketIntelligenceApi.company(cnpj)); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar a empresa.'); }
        finally { setDetailLoading(false); }
    };

    return (
        <section className="space-y-4" aria-labelledby="company-explorer-title">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
                <div className="flex items-start gap-3"><div className="rounded-2xl bg-orange-50 p-2.5 text-brand"><Building2 className="h-5 w-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-brand">Base empresarial detalhada</p><h2 id="company-explorer-title" className="text-2xl font-black text-[#333333]">Empresas reais por território</h2><p className="mt-1 text-sm text-slate-500">Filtros e paginação são executados no servidor sobre o snapshot publicado.</p></div></div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="text-xs font-bold text-slate-600">UF<input value={draft.uf ?? ''} maxLength={2} onChange={(event) => setDraft((current) => ({ ...current, uf: event.target.value.toUpperCase(), municipioIbge: '' }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand" /></label>
                    <label className="text-xs font-bold text-slate-600">Município<select value={draft.municipioIbge ?? ''} onChange={(event) => setDraft((current) => ({ ...current, municipioIbge: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand"><option value="">Todos</option>{territories.map((item) => <option key={item.municipioIbge} value={item.municipioIbge}>{item.municipioNome} ({number.format(item.activeCompanies)} ativas)</option>)}</select></label>
                    <label className="text-xs font-bold text-slate-600">CNPJ<input value={draft.cnpj ?? ''} onChange={(event) => setDraft((current) => ({ ...current, cnpj: event.target.value }))} placeholder="00.000.000/0000-00" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand" /></label>
                    <label className="text-xs font-bold text-slate-600">Razão social<input value={draft.razaoSocial ?? ''} onChange={(event) => setDraft((current) => ({ ...current, razaoSocial: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand" /></label>
                    <label className="text-xs font-bold text-slate-600">Nome fantasia<input value={draft.nomeFantasia ?? ''} onChange={(event) => setDraft((current) => ({ ...current, nomeFantasia: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand" /></label>
                    <label className="text-xs font-bold text-slate-600">CNAE<input value={draft.cnae ?? ''} onChange={(event) => setDraft((current) => ({ ...current, cnae: event.target.value }))} placeholder="49.30-2-02" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand" /></label>
                    <label className="text-xs font-bold text-slate-600">Situação<select value={draft.situacaoCadastral ?? ''} onChange={(event) => setDraft((current) => ({ ...current, situacaoCadastral: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><option value="">Todas</option>{['ATIVA', 'SUSPENSA', 'INAPTA', 'BAIXADA', 'NULA'].map((item) => <option key={item}>{item}</option>)}</select></label>
                    <label className="text-xs font-bold text-slate-600">ICP mínimo<select value={draft.icpMinimo ?? ''} onChange={(event) => setDraft((current) => ({ ...current, icpMinimo: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><option value="">Todos / não calculado</option>{['MUITO_ALTO', 'ALTO', 'MEDIO', 'BAIXO', 'FORA_DO_ICP'].map((item) => <option key={item}>{item}</option>)}</select></label>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={apply} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-black text-white focus-visible:ring-2 focus-visible:ring-brand"><Search className="h-4 w-4" />Consultar empresas</button>{selectedTerritory && <span className="text-xs text-slate-500">Brasil → {selectedTerritory.region ?? 'Região não disponível'} → {selectedTerritory.uf} → {selectedTerritory.municipioNome}</span>}{selectedTerritory?.rntrcTerritorial && <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800">RNTRC territorial: {number.format(selectedTerritory.rntrcTerritorial.transporters)} · {selectedTerritory.rntrcTerritorial.competencia}</span>}{refreshing && <span className="flex items-center gap-1 text-xs font-bold text-slate-500"><Loader2 className="h-3 w-3 animate-spin" />Atualizando dados…</span>}</div>
            </div>

            {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}
            {loading && <div className="flex min-h-48 items-center justify-center rounded-3xl border border-slate-200 bg-white"><Loader2 className="mr-2 h-5 w-5 animate-spin text-brand" />Carregando snapshot empresarial…</div>}
            {!loading && result && <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                <div className="flex flex-col gap-2 border-b border-slate-100 p-4 text-xs text-slate-500 md:flex-row md:items-center md:justify-between"><span><strong className="text-[#333333]">{number.format(result.pagination.total)}</strong> empresas encontradas</span><span>Fonte {result.metadata.source} · competência {result.metadata.competencia} · OBSERVED</span></div>
                {result.data.length === 0 ? <div className="p-10 text-center"><Building2 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-bold text-slate-700">Nenhuma empresa encontrada</p><p className="mt-1 text-sm text-slate-500">O estado vazio é real para os filtros e a competência publicados.</p></div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{['CNPJ', 'Razão social', 'Fantasia', 'CNAE', 'Município', 'Situação', 'Porte', 'ICP', 'RNTRC'].map((label) => <th key={label} className="p-3 font-black">{label}</th>)}</tr></thead><tbody>{result.data.map((company) => <tr key={company.cnpj} className="border-t border-slate-100 hover:bg-orange-50/40"><td className="p-3"><button type="button" onClick={() => openDetail(company.cnpj)} className="font-bold text-brand underline-offset-2 hover:underline">{company.cnpj}</button></td><td className="max-w-64 p-3 font-bold text-[#333333]">{company.razaoSocial}</td><td className="p-3">{available(company.nomeFantasia)}</td><td className="p-3">{available(company.cnaePrincipal)}</td><td className="p-3">{available(company.municipioNome)}/{available(company.uf)}</td><td className="p-3"><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${badge(company.situacaoCadastral)}`}>{available(company.situacaoCadastral)}</span></td><td className="p-3">{available(company.porte)}</td><td className="p-3">{available(company.icpTier)}</td><td className="p-3">{company.hasRntrc == null ? 'NÃO DISPONÍVEL' : company.hasRntrc ? 'SIM' : 'NÃO'}</td></tr>)}</tbody></table></div>}
                <div className="flex items-center justify-between border-t border-slate-100 p-4"><button type="button" disabled={!result.pagination.hasPrevious} onClick={() => setPage((current) => current - 1)} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Anterior</button><span className="text-xs text-slate-500">Página {result.pagination.page} de {Math.max(result.pagination.totalPages, 1)}</span><button type="button" disabled={!result.pagination.hasNext} onClick={() => setPage((current) => current + 1)} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-40">Próxima<ChevronRight className="h-4 w-4" /></button></div>
            </div>}
            {detailLoading && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35"><div className="rounded-2xl bg-white p-5 text-sm font-bold"><Loader2 className="mr-2 inline h-5 w-5 animate-spin text-brand" />Carregando empresa…</div></div>}
            {detail && <DetailPanel detail={detail} onClose={() => setDetail(null)} />}
        </section>
    );
}
