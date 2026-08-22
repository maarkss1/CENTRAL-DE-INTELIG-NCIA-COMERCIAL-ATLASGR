import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  FileSearch,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';

type CompanySummary = {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  matrizFilial: string | null;
  situacaoCadastral: string | null;
  cnaePrincipal: string | null;
  cnaePrincipalDescricao: string | null;
  porte: string | null;
  capitalSocial: string | null;
  municipioIbge: string | null;
  municipioNome: string | null;
  uf: string | null;
  opcaoSimples: string | null;
  opcaoMei: string | null;
  icpTier: string | null;
  icpScore: number | null;
  dataOrigin: string;
  competencia: string;
};

type CompanyDetail = CompanySummary & {
  cnpjBasico: string;
  cnpjOrdem: string;
  cnpjDv: string;
  situacaoCadastralCodigo: string | null;
  dataSituacaoCadastral: string | null;
  motivoSituacaoCadastral: string | null;
  dataInicioAtividade: string | null;
  cnaesSecundarios: unknown;
  naturezaJuridicaCodigo: string | null;
  naturezaJuridica: string | null;
  qualificacaoResponsavel: string | null;
  enteFederativoResponsavel: string | null;
  dataOpcaoSimples: string | null;
  dataExclusaoSimples: string | null;
  dataOpcaoMei: string | null;
  dataExclusaoMei: string | null;
  tipoLogradouro: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  municipioCodigoReceita: string | null;
  icpReasons: unknown;
  icpTaxonomyVersion: string | null;
  icpCalculatedAt: string | null;
  importedAt: string;
  provenance: {
    source: string;
    sourceVersion: string | null;
    sourceUrl: string | null;
    competencia: string;
    datasetHash: string;
    pipelineVersion: string;
    companyFields: string;
    icp: string;
    rntrcCompany: string;
    publicContact: string;
  };
};

type DatasetMeta = {
  competencia: string;
  source: string;
  sourceVersion: string | null;
  sourceUrl: string | null;
  recordsImported: number;
  recordsActive: number;
  hash: string;
  pipelineVersion: string;
  activatedAt: string | null;
};

type CatalogResponse = {
  success: boolean;
  data: CompanySummary[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  dataset: DatasetMeta | null;
};

type DetailResponse = { success: boolean; data: CompanyDetail; dataset: DatasetMeta };

type Filters = {
  q: string;
  uf: string;
  municipio: string;
  cnae: string;
  situacao: string;
  porte: string;
  matrizFilial: string;
  icpTier: string;
  sort: string;
};

const INITIAL_FILTERS: Filters = {
  q: '',
  uf: '',
  municipio: '',
  cnae: '',
  situacao: 'ATIVA',
  porte: '',
  matrizFilial: '',
  icpTier: '',
  sort: 'name',
};

const number = new Intl.NumberFormat('pt-BR');
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatCnpj(value: string) {
  const v = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (v.length !== 14) return value;
  return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
}

function formatCapital(value: string | null) {
  if (!value) return 'NÃO DISPONÍVEL';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? money.format(parsed) : value;
}

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return 'NÃO DISPONÍVEL';
  return String(value);
}

function sourceLabel(source: string) {
  return source === 'RECEITA_FEDERAL_CNPJ' ? 'Receita Federal · Dados Abertos CNPJ' : source;
}

function DetailPanel({ cnpj, onClose }: { cnpj: string; onClose: () => void }) {
  const [data, setData] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/companies/market-intelligence/${encodeURIComponent(cnpj)}`, { credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Falha ao carregar empresa.');
        return payload as DetailResponse;
      })
      .then((payload) => { if (!cancelled) setData(payload.data); })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cnpj]);

  return (
    <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l border-line bg-surface shadow-2xl" aria-label="Detalhe da empresa">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">Empresa real · snapshot oficial</p>
          <p className="mt-1 font-mono text-sm font-bold text-ink">{formatCnpj(cnpj)}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl border border-line p-2 text-ink-2 hover:bg-surface-2" aria-label="Fechar detalhe"><X className="h-5 w-5" /></button>
      </div>

      {loading && <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-ink-2"><Loader2 className="h-5 w-5 animate-spin" /> Carregando detalhe...</div>}
      {error && <div role="alert" className="m-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {data && (
        <div className="space-y-5 p-5 pb-10">
          <section className="rounded-3xl border border-line bg-surface-2 p-5">
            <h2 className="text-xl font-black text-ink">{data.razaoSocial}</h2>
            <p className="mt-1 text-sm text-ink-2">{data.nomeFantasia || 'Sem nome fantasia informado'}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-surface px-3 py-1.5 text-ink">{display(data.situacaoCadastral)}</span>
              <span className="rounded-full bg-surface px-3 py-1.5 text-ink">{display(data.matrizFilial)}</span>
              <span className="rounded-full bg-surface px-3 py-1.5 text-ink">{display(data.porte)}</span>
              {data.icpTier && <span className="rounded-full bg-orange-50 px-3 py-1.5 text-orange-800">ICP {data.icpTier.replaceAll('_', ' ')}</span>}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {[
              ['CNAE principal', [data.cnaePrincipal, data.cnaePrincipalDescricao].filter(Boolean).join(' · ')],
              ['Natureza jurídica', [data.naturezaJuridicaCodigo, data.naturezaJuridica].filter(Boolean).join(' · ')],
              ['Capital social', formatCapital(data.capitalSocial)],
              ['Início da atividade', data.dataInicioAtividade],
              ['Simples Nacional', data.opcaoSimples],
              ['MEI', data.opcaoMei],
              ['Qualificação responsável', data.qualificacaoResponsavel],
              ['Origem do campo cadastral', data.dataOrigin],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-line p-4">
                <dt className="text-[10px] font-black uppercase tracking-[0.15em] text-ink-2">{label}</dt>
                <dd className="mt-1 text-sm font-bold leading-5 text-ink">{display(value)}</dd>
              </div>
            ))}
          </section>

          <section className="rounded-3xl border border-line p-5">
            <div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-brand" /><h3 className="font-black text-ink">Endereço cadastral</h3></div>
            <p className="mt-3 text-sm leading-6 text-ink">
              {[data.tipoLogradouro, data.logradouro, data.numero, data.complemento].filter(Boolean).join(' ')}
              <br />
              {[data.bairro, data.municipioNome, data.uf].filter(Boolean).join(' · ')} {data.cep ? `· CEP ${data.cep}` : ''}
            </p>
            <p className="mt-2 text-xs text-ink-2">IBGE: {display(data.municipioIbge)} · Receita: {display(data.municipioCodigoReceita)}</p>
          </section>

          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-2 text-emerald-800"><ShieldCheck className="h-5 w-5" /><h3 className="font-black">Governança de contatos e RNTRC</h3></div>
            <p className="mt-2 text-sm leading-6 text-emerald-900">
              Telefone, fax e e-mail não são publicados no catálogo empresarial global. Qualquer contato futuro deve entrar por enriquecimento escopado ao tenant. RNTRC municipal permanece um indicador territorial e não é atribuído automaticamente a este CNPJ.
            </p>
          </section>

          <section className="rounded-3xl border border-line p-5">
            <div className="flex items-center gap-2"><Database className="h-5 w-5 text-brand" /><h3 className="font-black text-ink">Proveniência</h3></div>
            <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
              <div><dt className="font-bold text-ink-2">Fonte</dt><dd className="mt-1 text-ink">{sourceLabel(data.provenance.source)}</dd></div>
              <div><dt className="font-bold text-ink-2">Competência</dt><dd className="mt-1 text-ink">{data.provenance.competencia}</dd></div>
              <div><dt className="font-bold text-ink-2">Pipeline</dt><dd className="mt-1 text-ink">{data.provenance.pipelineVersion}</dd></div>
              <div><dt className="font-bold text-ink-2">ICP</dt><dd className="mt-1 text-ink">{data.provenance.icp}</dd></div>
            </dl>
            {data.provenance.sourceUrl && (
              <a href={data.provenance.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-black text-[#C43E0E] hover:underline">
                Abrir fonte registrada <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}

export function MarketIntelligenceCompanies() {
  const [draft, setDraft] = useState<Filters>(INITIAL_FILTERS);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCnpj, setSelectedCnpj] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  }, [filters, page]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/companies/market-intelligence?${queryString}`, { credentials: 'include' })
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'Falha ao consultar o catálogo empresarial.');
        return payload as CatalogResponse;
      })
      .then((payload) => { if (!cancelled) setResponse(payload); })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [queryString]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setFilters({ ...draft });
  };

  const clear = () => {
    setDraft(INITIAL_FILTERS);
    setFilters(INITIAL_FILTERS);
    setPage(1);
  };

  return (
    <div className="space-y-5 p-4 md:p-6 lg:p-8">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">Etapa 2 · Universo empresarial</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-ink md:text-3xl">Empresas reais do Market Intelligence</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-2">Consulta server-side sobre o snapshot publicado. O catálogo é separado das empresas do CRM: pesquisar um CNPJ não cria conta comercial.</p>
        </div>
        {response?.dataset && (
          <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-xs text-ink-2 shadow-sm">
            <div className="font-black text-ink">Competência {response.dataset.competencia}</div>
            <div className="mt-1">{number.format(response.dataset.recordsImported)} registros · {number.format(response.dataset.recordsActive)} ativos</div>
          </div>
        )}
      </header>

      <form onSubmit={submit} className="rounded-3xl border border-line bg-surface p-4 shadow-sm md:p-5">
        <div className="grid gap-3 lg:grid-cols-4">
          <label className="lg:col-span-2"><span className="text-xs font-bold text-ink-2">CNPJ, razão social ou fantasia</span><div className="mt-1 flex items-center rounded-xl border border-line px-3"><Search className="h-4 w-4 text-ink-2" /><input value={draft.q} onChange={(e) => setDraft((v) => ({ ...v, q: e.target.value }))} className="w-full bg-transparent px-2 py-2.5 text-sm outline-none" placeholder="Ex.: transportadora ou 00.000.000/E08G-12" /></div></label>
          <label><span className="text-xs font-bold text-ink-2">UF</span><input value={draft.uf} maxLength={2} onChange={(e) => setDraft((v) => ({ ...v, uf: e.target.value.toUpperCase() }))} className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" placeholder="SP" /></label>
          <label><span className="text-xs font-bold text-ink-2">Município</span><input value={draft.municipio} onChange={(e) => setDraft((v) => ({ ...v, municipio: e.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand" placeholder="Ribeirão Preto" /></label>
          <label><span className="text-xs font-bold text-ink-2">CNAE principal</span><input value={draft.cnae} onChange={(e) => setDraft((v) => ({ ...v, cnae: e.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-sm" placeholder="4930202" /></label>
          <label><span className="text-xs font-bold text-ink-2">Situação</span><select value={draft.situacao} onChange={(e) => setDraft((v) => ({ ...v, situacao: e.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-sm"><option value="ATIVA">Ativa</option><option value="TODAS">Todas</option><option value="BAIXADA">Baixada</option><option value="SUSPENSA">Suspensa</option><option value="INAPTA">Inapta</option></select></label>
          <label><span className="text-xs font-bold text-ink-2">Matriz / filial</span><select value={draft.matrizFilial} onChange={(e) => setDraft((v) => ({ ...v, matrizFilial: e.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-sm"><option value="">Todas</option><option value="MATRIZ">Matriz</option><option value="FILIAL">Filial</option></select></label>
          <label><span className="text-xs font-bold text-ink-2">ICP</span><select value={draft.icpTier} onChange={(e) => setDraft((v) => ({ ...v, icpTier: e.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-sm"><option value="">Todos / não calculado</option><option value="MUITO_ALTO">Muito alto</option><option value="ALTO">Alto</option><option value="MEDIO">Médio</option><option value="BAIXO">Baixo</option><option value="FORA_DO_ICP">Fora do ICP</option></select></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-black text-white hover:bg-brand-2"><Search className="h-4 w-4" /> Consultar</button><button type="button" onClick={clear} className="rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-ink-2 hover:bg-surface-2">Limpar filtros</button></div>
      </form>

      {error && <div role="alert" className="flex gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><AlertTriangle className="h-5 w-5 shrink-0" /><span>{error}</span></div>}
      {!error && !loading && response && !response.dataset && <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center"><Database className="mx-auto h-8 w-8 text-amber-700" /><h2 className="mt-3 text-lg font-black text-amber-900">Nenhum snapshot empresarial ativo</h2><p className="mt-2 text-sm text-amber-800">A estrutura está pronta, mas a publicação CNPJ_ACTIVE ainda não foi concluída no banco deste ambiente.</p></div>}

      <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm" aria-busy={loading}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-brand" /><h2 className="font-black text-ink">Resultado empresarial</h2></div>{response?.meta && <span className="text-xs font-bold text-ink-2">{number.format(response.meta.total)} empresas</span>}</div>
        {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-ink-2"><Loader2 className="h-5 w-5 animate-spin" /> Consultando snapshot...</div> : response?.data.length ? (
          <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-surface-2 text-ink-2"><tr><th className="p-3">Empresa</th><th className="p-3">CNPJ</th><th className="p-3">Município</th><th className="p-3">CNAE</th><th className="p-3">Porte</th><th className="p-3">Capital social</th><th className="p-3">ICP</th><th className="p-3"><span className="sr-only">Ação</span></th></tr></thead><tbody>{response.data.map((company) => <tr key={company.id} className="border-t border-line align-top hover:bg-surface-2/70"><td className="p-3"><div className="font-black text-ink">{company.razaoSocial}</div><div className="mt-0.5 text-ink-2">{company.nomeFantasia || 'Sem fantasia'} · {display(company.matrizFilial)}</div></td><td className="p-3 font-mono font-bold text-ink">{formatCnpj(company.cnpj)}</td><td className="p-3">{display(company.municipioNome)}{company.uf ? `/${company.uf}` : ''}</td><td className="p-3"><div className="font-bold">{display(company.cnaePrincipal)}</div><div className="mt-0.5 max-w-64 text-ink-2">{display(company.cnaePrincipalDescricao)}</div></td><td className="p-3">{display(company.porte)}</td><td className="p-3 font-bold">{formatCapital(company.capitalSocial)}</td><td className="p-3">{company.icpTier ? <span className="rounded-full bg-orange-50 px-2 py-1 font-bold text-orange-800">{company.icpTier.replaceAll('_', ' ')}</span> : <span className="text-ink-2">Não calculado</span>}</td><td className="p-3"><button type="button" onClick={() => setSelectedCnpj(company.cnpj)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 font-black text-ink hover:border-brand hover:text-[#C43E0E]">Abrir <FileSearch className="h-3.5 w-3.5" /></button></td></tr>)}</tbody></table></div>
        ) : response?.dataset ? <div className="p-10 text-center text-sm text-ink-2"><FileSearch className="mx-auto h-8 w-8 text-ink-2" /><p className="mt-3 font-bold text-ink">Nenhuma empresa encontrada com estes filtros.</p><p className="mt-1">A API não completa a lista com registros artificiais.</p></div> : null}
        {response?.meta && response.meta.totalPages > 1 && <div className="flex items-center justify-between border-t border-line px-5 py-4 text-xs"><span className="text-ink-2">Página {response.meta.page} de {response.meta.totalPages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))} className="rounded-lg border border-line p-2 disabled:opacity-40" aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button><button type="button" disabled={page >= response.meta.totalPages} onClick={() => setPage((v) => v + 1)} className="rounded-lg border border-line p-2 disabled:opacity-40" aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></button></div></div>}
      </section>

      {selectedCnpj && <DetailPanel cnpj={selectedCnpj} onClose={() => setSelectedCnpj(null)} />}
    </div>
  );
}
