import { useState } from 'react';
import { Search, Plus, Building2, MapPin, Building, Edit, Trash, Sparkles, Loader2, LayoutGrid, LayoutList, Wrench, ExternalLink, WifiOff } from 'lucide-react';
import { Company } from '../../../types';
import { CompanyForm } from './CompanyForm';
import { CompanyDetail } from './CompanyDetail';
import { useCompanies } from '../../../hooks/useDatabase';
import { companiesDB } from '../../../lib/db';
import { EmptyState } from '../../../components/ui/EmptyState';
import { TechToolLogo, TechToolInfo } from '../../../components/ui/TechToolLogo';
import { ToolTechPopover } from '../../../components/ui/ToolTechPopover';
import { ContextualTip } from '../../../components/ui/ContextualTip';

export function CompanyList() {
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
    const [layoutMode, setLayoutMode] = useState<'table' | 'grid'>('grid');
    const [enrichingId, setEnrichingId] = useState<string | null>(null);
    const [activeToolPopover, setActiveToolPopover] = useState<TechToolInfo | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);

    const { companies, meta, loading, error, refetch, deleteCompany } = useCompanies({
        page,
        limit: 20,
        search: searchTerm || undefined,
    });

    const totalPages = meta?.totalPages ?? 1;

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir esta empresa?')) return;
        try {
            await deleteCompany(id);
        } catch (error) {
            console.error('Error deleting company:', error);
        }
    };

    const handleSave = () => {
        setIsFormOpen(false);
        refetch();
    };

    const handleEnrich = async (id: string) => {
        setEnrichingId(id);
        try {
            await companiesDB.enrich(companies.find(c => c.id === id)?.cnpj ?? '');
            await refetch();
        } catch (error) {
            console.error('Error enriching company:', error);
        } finally {
            setEnrichingId(null);
        }
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleAll = () => {
        if (selectedIds.size === companies.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(companies.map(c => c.id)));
        }
    };

    const handleBulkEnrich = async () => {
        if (selectedIds.size === 0) return;
        setIsBulkProcessing(true);
        const targets = companies.filter((c) => selectedIds.has(c.id));
        let succeeded = 0;
        let skipped = 0;
        let failed = 0;
        try {
            for (const company of targets) {
                if (!company.cnpj) {
                    skipped += 1;
                    continue;
                }
                try {
                    await companiesDB.enrich(company.cnpj);
                    succeeded += 1;
                } catch (error) {
                    console.error(`Error enriching company ${company.id}:`, error);
                    failed += 1;
                }
            }
            await refetch();
            const parts = [`${succeeded} enriquecida${succeeded === 1 ? '' : 's'}`];
            if (failed > 0) parts.push(`${failed} falhou/falharam`);
            if (skipped > 0) parts.push(`${skipped} sem CNPJ (ignorada${skipped === 1 ? '' : 's'})`);
            alert(parts.join(', ') + '.');
        } finally {
            setIsBulkProcessing(false);
            setSelectedIds(new Set());
        }
    };

    if (viewMode === 'detail' && selectedCompany) {
        return <CompanyDetail companyId={selectedCompany.id} onBack={() => { setViewMode('list'); setSelectedCompany(null); }} />;
    }

    return (
        <div className="flex-1 overflow-y-auto bg-bg text-ink p-6 md:p-8 space-y-6">
            {/* Popover de Tecnologia */}
            <ToolTechPopover 
                info={activeToolPopover} 
                onClose={() => setActiveToolPopover(null)} 
                onFilterByTool={(tool) => {
                    setSearchTerm(tool);
                    setPage(1);
                }}
            />

            <div className="max-w-7xl mx-auto space-y-6">
                {/* Banner de Dica Contextual */}
                <ContextualTip
                    id="tip-companies-tech"
                    title="Prospecção Baseada em Tecnologias (Firmographics)"
                    description="Clique em qualquer logo de ferramenta nas empresas para ver detalhes do software ou filtrar todas as contas que utilizam a mesma tecnologia. Ideal para abordagens altamente personalizadas do SDR!"
                    actionLabel="Ver Dicas Avançadas"
                    onAction={() => alert('Dica Atlas: Empresas que utilizam React + AWS costumam ter maior maturidade digital e budget elevado para conectividade e GR.')}
                />

                {/* Top Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface p-6 rounded-3xl border border-line backdrop-blur-xl">
                    <div>
                        <h1 className="text-3xl font-extrabold text-ink flex items-center gap-3 tracking-tight">
                            🏢 Empresas & Carteira
                            <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full font-bold">
                                {companies.length} Mapeadas
                            </span>
                        </h1>
                        <p className="text-ink-2 text-sm mt-1">Gerencie prospects com visibilidade total do ecossistema de software e inteligência</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Layout Mode Toggle */}
                        <div className="bg-surface-2 p-1 rounded-2xl border border-line flex items-center gap-1">
                            <button
                                onClick={() => setLayoutMode('grid')}
                                className={`p-2 rounded-xl transition-all flex items-center gap-1 text-xs font-semibold ${layoutMode === 'grid' ? 'bg-blue-600 text-white shadow-md' : 'text-ink-2 hover:text-ink'}`}
                                title="Visão em Cards com Logos de Ferramentas"
                            >
                                <LayoutGrid className="w-4 h-4" />
                                <span className="hidden sm:inline">Cards</span>
                            </button>
                            <button
                                onClick={() => setLayoutMode('table')}
                                className={`p-2 rounded-xl transition-all flex items-center gap-1 text-xs font-semibold ${layoutMode === 'table' ? 'bg-blue-600 text-white shadow-md' : 'text-ink-2 hover:text-ink'}`}
                                title="Visão em Tabela Compacta"
                            >
                                <LayoutList className="w-4 h-4" />
                                <span className="hidden sm:inline">Tabela</span>
                            </button>
                        </div>

                        <button
                            onClick={() => { setSelectedCompany(null); setIsFormOpen(true); }}
                            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-2xl font-bold transition-all shadow-lg hover:shadow-blue-500/25 active:scale-95 cursor-pointer"
                        >
                            <Plus className="w-5 h-5" />
                            Nova Empresa
                        </button>
                    </div>
                </div>

                {/* Search & Filter Bar */}
                <div className="bg-surface p-4 rounded-2xl border border-line shadow-lg flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="relative flex-1 w-full">
                        <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-2" />
                        <input
                            type="text"
                            placeholder="🔎 Buscar por nome, CNPJ, ferramenta (ex: AWS, React, SAP), cidade..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                            className="w-full pl-11 pr-4 py-2.5 bg-surface-2 border border-line text-ink placeholder-ink-2 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all outline-none text-sm"
                        />
                    </div>
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="text-xs text-ink-2 hover:text-ink px-3 py-1.5 bg-surface-2 rounded-xl transition-colors shrink-0"
                        >
                            Limpar busca
                        </button>
                    )}
                </div>

                {/* CONTENT AREA: Cards Grid vs Table View */}
                {loading ? (
                    <div className="p-16 text-center bg-surface rounded-3xl border border-line flex flex-col items-center gap-4">
                        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-ink-2 font-medium text-sm">Carregando carteira de empresas e logos de ferramentas...</p>
                    </div>
                ) : error ? (
                    <div className="bg-surface border border-line rounded-3xl p-8">
                        <EmptyState
                            title="Não foi possível carregar as empresas"
                            description={error}
                            actionLabel="Tentar novamente"
                            onAction={refetch}
                            icon={<WifiOff className="w-10 h-10 text-atlas-orange" />}
                        />
                    </div>
                ) : companies.length === 0 ? (
                    <div className="bg-surface border border-line rounded-3xl p-8">
                        <EmptyState
                            title="Nenhuma empresa encontrada"
                            description="Não encontramos empresas cadastradas com os filtros atuais."
                            actionLabel="Cadastrar Nova Empresa"
                            onAction={() => { setSelectedCompany(null); setIsFormOpen(true); }}
                            icon={<Building className="w-10 h-10 text-atlas-orange" />}
                        />
                    </div>
                ) : layoutMode === 'grid' ? (
                    /* CARDS GRID VIEW */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {companies.map((company) => {
                            const techStack = company.technologies && company.technologies.length > 0
                                ? company.technologies
                                : ['React', 'AWS', 'Salesforce']; // Fallback demonstrativo caso sem tecnologias

                            return (
                                <div
                                    key={company.id}
                                    className={`bg-surface hover:bg-surface-2 border border-line hover:border-blue-500/40 rounded-3xl p-6 transition-all duration-300 transform hover:-translate-y-1 shadow-lg hover:shadow-2xl flex flex-col justify-between group relative overflow-hidden ${selectedIds.has(company.id) ? 'ring-2 ring-blue-500 bg-blue-950/20' : ''}`}
                                >
                                    {/* Top card info */}
                                    <div className="space-y-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-line bg-surface-2 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    checked={selectedIds.has(company.id)}
                                                    onChange={() => toggleSelection(company.id)}
                                                />
                                                <div
                                                    onClick={() => { setSelectedCompany(company); setViewMode('detail'); }}
                                                    className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 cursor-pointer group-hover:scale-105 transition-transform overflow-hidden"
                                                >
                                                    {company.logoUrl ? (
                                                        <img src={company.logoUrl} alt="" className="w-full h-full object-contain p-1" />
                                                    ) : (
                                                        <Building2 className="w-6 h-6" />
                                                    )}
                                                </div>
                                            </div>

                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                                                company.status === 'Ativo' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                                'bg-surface-2 text-ink-2 border-line'
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${company.status === 'Ativo' ? 'bg-green-400 animate-ping' : 'bg-ink-2'}`} />
                                                {company.status}
                                            </span>
                                        </div>

                                        <div className="cursor-pointer" onClick={() => { setSelectedCompany(company); setViewMode('detail'); }}>
                                            <h3 className="text-lg font-bold text-ink group-hover:text-blue-400 transition-colors line-clamp-1">
                                                {company.tradeName || company.legalName}
                                            </h3>
                                            <p className="text-xs text-ink-2 font-mono mt-0.5">
                                                {company.cnpj || 'CNPJ Não informado'}
                                            </p>
                                        </div>

                                        <div className="flex flex-wrap gap-2 text-xs text-ink-2">
                                            {company.segment && (
                                                <span className="bg-surface-2 px-2.5 py-1 rounded-lg border border-line flex items-center gap-1 text-ink-2">
                                                    <Building className="w-3.5 h-3.5 text-ink-2" />
                                                    {company.segment}
                                                </span>
                                            )}
                                            {(company.city || company.state) && (
                                                <span className="bg-surface-2 px-2.5 py-1 rounded-lg border border-line flex items-center gap-1 text-ink-2">
                                                    <MapPin className="w-3.5 h-3.5 text-ink-2" />
                                                    {company.city}{company.state ? `, ${company.state}` : ''}
                                                </span>
                                            )}
                                        </div>

                                        {/* LOGOS DAS FERRAMENTAS DA EMPRESA */}
                                        <div className="pt-3 border-t border-line space-y-2">
                                            <p className="text-[11px] uppercase tracking-wider font-extrabold text-ink-2 flex items-center gap-1">
                                                <Wrench className="w-3 h-3 text-blue-400" />
                                                Ferramentas & Tech Stack
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {techStack.slice(0, 5).map((tech, idx) => (
                                                    <TechToolLogo
                                                        key={idx}
                                                        techName={tech}
                                                        size="sm"
                                                        onClick={(info) => setActiveToolPopover(info)}
                                                    />
                                                ))}
                                                {techStack.length > 5 && (
                                                    <span className="text-[11px] text-ink-2 px-2 py-0.5 rounded-lg bg-surface-2 border border-line flex items-center">
                                                        +{techStack.length - 5}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Footer */}
                                    <div className="mt-5 pt-3 border-t border-line flex items-center justify-between">
                                        <button
                                            onClick={() => { setSelectedCompany(company); setViewMode('detail'); }}
                                            className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                                        >
                                            Ver Perfil Completo
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </button>

                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleEnrich(company.id)}
                                                disabled={enrichingId === company.id}
                                                className="p-2 text-ink-2 hover:text-amber-400 hover:bg-amber-500/10 rounded-xl transition-colors"
                                                title="✨ Enriquecer com IA"
                                            >
                                                {enrichingId === company.id ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <Sparkles className="w-4 h-4" />}
                                            </button>
                                            <button
                                                onClick={() => { setSelectedCompany(company); setIsFormOpen(true); }}
                                                className="p-2 text-ink-2 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-colors"
                                                title="Editar"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(company.id)}
                                                className="p-2 text-ink-2 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                                                title="Excluir"
                                            >
                                                <Trash className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* TABLE VIEW */
                    <div className="bg-surface rounded-3xl border border-line overflow-hidden shadow-xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-line bg-surface-2">
                                        <th className="p-4 w-12">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-line bg-surface-2 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                checked={companies.length > 0 && selectedIds.size === companies.length}
                                                onChange={toggleAll}
                                            />
                                        </th>
                                        <th className="p-4 text-xs font-bold uppercase tracking-wider text-ink-2">Empresa</th>
                                        <th className="p-4 text-xs font-bold uppercase tracking-wider text-ink-2">Ferramentas Mapeadas</th>
                                        <th className="p-4 text-xs font-bold uppercase tracking-wider text-ink-2 hidden md:table-cell">Segmento</th>
                                        <th className="p-4 text-xs font-bold uppercase tracking-wider text-ink-2 hidden lg:table-cell">Localização</th>
                                        <th className="p-4 text-xs font-bold uppercase tracking-wider text-ink-2">Status</th>
                                        <th className="p-4 text-xs font-bold uppercase tracking-wider text-ink-2 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                    {companies.map((company) => {
                                        const techStack = company.technologies && company.technologies.length > 0
                                            ? company.technologies
                                            : ['React', 'AWS'];

                                        return (
                                            <tr key={company.id} className={`hover:bg-surface-2 transition-colors group ${selectedIds.has(company.id) ? 'bg-blue-950/20' : ''}`}>
                                                <td className="p-4">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 rounded border-line bg-surface-2 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                        checked={selectedIds.has(company.id)}
                                                        onChange={() => toggleSelection(company.id)}
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setSelectedCompany(company); setViewMode('detail'); }}>
                                                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 font-bold overflow-hidden">
                                                            {company.logoUrl ? (
                                                                <img src={company.logoUrl} alt="" className="w-full h-full object-contain p-1" />
                                                            ) : (
                                                                <Building2 className="w-5 h-5" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-ink hover:text-blue-400 transition-colors">{company.tradeName || company.legalName}</p>
                                                            <p className="text-xs text-ink-2 font-mono">{company.cnpj || 'Sem CNPJ'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* Ferramentas em formato de logos */}
                                                <td className="p-4">
                                                    <div className="flex flex-wrap gap-1">
                                                        {techStack.slice(0, 3).map((tech, idx) => (
                                                            <TechToolLogo
                                                                key={idx}
                                                                techName={tech}
                                                                size="sm"
                                                                onClick={(info) => setActiveToolPopover(info)}
                                                            />
                                                        ))}
                                                        {techStack.length > 3 && (
                                                            <span className="text-[10px] text-ink-2 px-1.5 py-0.5 rounded bg-surface-2 border border-line">
                                                                +{techStack.length - 3}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-4 hidden md:table-cell text-sm text-ink-2">
                                                    {company.segment || '-'}
                                                </td>
                                                <td className="p-4 hidden lg:table-cell text-sm text-ink-2">
                                                    {company.city ? `${company.city}, ${company.state}` : '-'}
                                                </td>
                                                <td className="p-4">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                                                        company.status === 'Ativo' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                                        'bg-surface-2 text-ink-2 border-line'
                                                    }`}>
                                                        {company.status}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => handleEnrich(company.id)}
                                                            disabled={enrichingId === company.id}
                                                            className="p-2 text-ink-2 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                                                            title="✨ Enriquecer"
                                                        >
                                                            {enrichingId === company.id ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <Sparkles className="w-4 h-4" />}
                                                        </button>
                                                        <button
                                                            onClick={() => { setSelectedCompany(company); setIsFormOpen(true); }}
                                                            className="p-2 text-ink-2 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                            title="Editar"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(company.id)}
                                                            className="p-2 text-ink-2 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                            title="Excluir"
                                                        >
                                                            <Trash className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="p-4 bg-surface border border-line rounded-2xl flex justify-between items-center text-sm">
                        <span className="text-ink-2">
                            Página <strong className="text-ink">{page}</strong> de <strong className="text-ink">{totalPages}</strong>
                        </span>
                        <div className="flex gap-2">
                            <button
                                disabled={page === 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="px-4 py-2 bg-surface-2 border border-line text-ink-2 rounded-xl hover:bg-surface disabled:opacity-50 transition-colors font-medium cursor-pointer"
                            >
                                Anterior
                            </button>
                            <button
                                disabled={page === totalPages}
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                className="px-4 py-2 bg-surface-2 border border-line text-ink-2 rounded-xl hover:bg-surface disabled:opacity-50 transition-colors font-medium cursor-pointer"
                            >
                                Próxima
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {isFormOpen && (
                <CompanyForm
                    company={selectedCompany}
                    onClose={() => { setIsFormOpen(false); setSelectedCompany(null); }}
                    onSave={handleSave}
                />
            )}

            {/* Floating Bulk Actions Toolbar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-surface border border-blue-500/40 text-ink px-6 py-4 rounded-full shadow-2xl flex items-center gap-6 z-50 animate-in slide-in-from-bottom-5 duration-300 backdrop-blur-xl">
                    <div className="flex items-center gap-2">
                        <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold">{selectedIds.size}</span>
                        <span className="text-sm font-bold">empresas selecionadas</span>
                    </div>
                    <div className="w-px h-6 bg-line"></div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleBulkEnrich}
                            disabled={isBulkProcessing}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 rounded-full text-xs font-bold transition-all"
                        >
                            {isBulkProcessing ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : <Sparkles className="w-4 h-4 text-purple-400" />}
                            Enriquecer com IA
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
