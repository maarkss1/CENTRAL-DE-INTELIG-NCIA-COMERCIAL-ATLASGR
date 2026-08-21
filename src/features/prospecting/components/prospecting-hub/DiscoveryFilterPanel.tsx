import { Search, Loader2, Cpu, Database, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import type { ProspectCriteria } from '../../services/prospecting.service';
import { PORTE_OPTIONS, TECNOLOGIA_OPTIONS } from '../../../../shared/constants/icp-options';

export function DiscoveryFilterPanel({
    criteria, setCriteria, activeSegments, cities, showAdvanced, setShowAdvanced,
    isSearching, discoverError, onDiscover,
}: {
    criteria: ProspectCriteria;
    setCriteria: (criteria: ProspectCriteria) => void;
    activeSegments: readonly string[];
    cities: string[];
    showAdvanced: boolean;
    setShowAdvanced: (updater: (v: boolean) => boolean) => void;
    isSearching: boolean;
    discoverError: string | null;
    onDiscover: () => void;
}) {
    return (
        <div className="xl:col-span-4 bg-surface p-6 sm:p-8 rounded-2xl border border-line shadow-sm relative overflow-hidden flex flex-col h-full max-h-[800px]">
            <div className="absolute top-0 right-0 w-40 h-40 bg-brand opacity-5 transform rotate-45 translate-x-20 -translate-y-20" />
            <div className="flex items-center gap-2 mb-6 relative z-10">
                <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center text-brand">
                    <Database size={18} />
                </div>
                <h2 className="font-black text-xl text-ink">🗺️ Motor de Busca Turbo</h2>
            </div>
            <p className="text-xs text-ink-2 mb-3 relative z-10">Busca real via Google Maps, OpenStreetMap e Apollo quando as integrações estão habilitadas.</p>

            <div className="space-y-4 relative z-10 flex-1 overflow-y-auto pr-2">
                <div>
                    <label htmlFor="discovery-icp" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">ICP (Perfil de Cliente Ideal)</label>
                    <textarea
                        id="discovery-icp"
                        placeholder="Ex: Transportadoras de médio porte com frota própria que sofrem com roubo de carga..."
                        className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink placeholder-ink-2 resize-none"
                        rows={2}
                        value={criteria.icp || ''}
                        onChange={(e) => setCriteria({ ...criteria, icp: e.target.value })}
                    />
                </div>
                <div>
                    <label htmlFor="discovery-persona" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Persona do Decisor</label>
                    <textarea
                        id="discovery-persona"
                        placeholder="Ex: Diretor de Logística, Gerente de Frota, CEO..."
                        className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink placeholder-ink-2 resize-none"
                        rows={2}
                        value={criteria.persona || ''}
                        onChange={(e) => setCriteria({ ...criteria, persona: e.target.value })}
                    />
                </div>
                <div>
                    <label htmlFor="discovery-segmento" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Segmento Genérico</label>
                    <input
                        id="discovery-segmento"
                        type="text"
                        placeholder="Ex: Transportadora / Frotista, Logística..."
                        className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink placeholder-ink-2"
                        value={criteria.segmento || ''}
                        onChange={(e) => setCriteria({ ...criteria, segmento: e.target.value })}
                    />
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label htmlFor="discovery-estado" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Estado</label>
                        <input
                            id="discovery-estado"
                            type="text"
                            placeholder="Ex: São Paulo, SP, Sul..."
                            className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink placeholder-ink-2"
                            value={criteria.estado || ''}
                            onChange={(e) => {
                                const estado = e.target.value;
                                setCriteria({
                                    ...criteria,
                                    estado,
                                    localizacao: criteria.cidade ? `${criteria.cidade}, ${estado}` : estado || criteria.localizacao
                                });
                            }}
                        />
                    </div>
                    <div>
                        <label htmlFor="discovery-cidade" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Cidade (opcional)</label>
                        <input
                            id="discovery-cidade"
                            type="text"
                            list="cidade-suggestions"
                            placeholder="Ex: Campinas, Santos..."
                            className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink placeholder-ink-2"
                            value={criteria.cidade || ''}
                            onChange={(e) => {
                                const cidade = e.target.value;
                                setCriteria({
                                    ...criteria,
                                    cidade,
                                    localizacao: cidade ? (criteria.estado ? `${cidade}, ${criteria.estado}` : cidade) : criteria.estado || ''
                                });
                            }}
                        />
                        {cities.length > 0 && (
                            <datalist id="cidade-suggestions">
                                {cities.map((city) => <option key={city} value={city} />)}
                            </datalist>
                        )}
                    </div>
                </div>

                <div>
                    <label htmlFor="discovery-pesquisar" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Pesquisar por nome ou empresa</label>
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-2 pointer-events-none" />
                        <input
                            id="discovery-pesquisar"
                            type="search"
                            placeholder="Ex: Transportadora ABC, armazém..."
                            value={criteria.nomeEmpresa || ''}
                            onChange={(e) => setCriteria({ ...criteria, nomeEmpresa: e.target.value || undefined })}
                            onKeyDown={(e) => e.key === 'Enter' && onDiscover()}
                            className="w-full py-3 pl-9 pr-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                        />
                    </div>
                    <p className="text-[10px] text-ink-2 mt-1">Refina Google Maps, Apollo e OpenStreetMap pelo nome informado.</p>
                </div>

                <div>
                    <label htmlFor="discovery-quantidade" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Quantidade de Leads</label>
                    <input
                        id="discovery-quantidade"
                        type="number"
                        min={1}
                        max={500}
                        placeholder="Ex: 10, 25, 50..."
                        className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink placeholder-ink-2"
                        value={criteria.quantidade ?? 10}
                        onChange={(e) => setCriteria({ ...criteria, quantidade: Number(e.target.value) || 10 })}
                    />
                </div>

                <button
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex items-center justify-between w-full text-[10px] tracking-wider font-bold uppercase text-ink-2 hover:text-brand transition-colors pt-2"
                >
                    <span className="flex items-center gap-1.5"><SlidersHorizontal size={12} /> Filtros Avançados (Apollo.io)</span>
                    {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showAdvanced && (
                    <div className="space-y-4 pt-1">
                        <div>
                            <label htmlFor="discovery-porte" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Porte (nº de funcionários)</label>
                            <select
                                id="discovery-porte"
                                className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                                value={criteria.porte || ''}
                                onChange={(e) => setCriteria({ ...criteria, porte: e.target.value || undefined })}
                            >
                                {PORTE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="discovery-faturamento-min" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Faturamento Anual Estimado (USD)</label>
                            <div className="flex gap-2">
                                <input
                                    id="discovery-faturamento-min"
                                    type="number"
                                    placeholder="Mínimo"
                                    value={criteria.faturamentoMin ?? ''}
                                    onChange={(e) => setCriteria({ ...criteria, faturamentoMin: e.target.value ? Number(e.target.value) : undefined })}
                                    className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                                />
                                <input
                                    type="number"
                                    placeholder="Máximo"
                                    value={criteria.faturamentoMax ?? ''}
                                    onChange={(e) => setCriteria({ ...criteria, faturamentoMax: e.target.value ? Number(e.target.value) : undefined })}
                                    className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                                />
                            </div>
                            <p className="text-[10px] text-ink-2 mt-1">Dado da Apollo é normalizado em dólar, independente do mercado.</p>
                        </div>
                        <div>
                            <label htmlFor="discovery-palavras-chave" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Palavras-chave adicionais</label>
                            <input
                                id="discovery-palavras-chave"
                                type="text"
                                placeholder="Ex: refrigerated, cargo, fleet"
                                value={criteria.palavrasChave || ''}
                                onChange={(e) => setCriteria({ ...criteria, palavrasChave: e.target.value || undefined })}
                                className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                            />
                            <p className="text-[10px] text-ink-2 mt-1">Separadas por vírgula — somam ao segmento na busca da Apollo.</p>
                        </div>
                        <div>
                            <label htmlFor="discovery-ano-min" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Ano de Fundação (Mín e Máx)</label>
                            <div className="flex gap-2">
                                <input
                                    id="discovery-ano-min"
                                    type="number"
                                    placeholder="De"
                                    value={criteria.anoFundacaoMin ?? ''}
                                    onChange={(e) => setCriteria({ ...criteria, anoFundacaoMin: e.target.value ? Number(e.target.value) : undefined })}
                                    className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                                />
                                <input
                                    type="number"
                                    placeholder="Até"
                                    value={criteria.anoFundacaoMax ?? ''}
                                    onChange={(e) => setCriteria({ ...criteria, anoFundacaoMax: e.target.value ? Number(e.target.value) : undefined })}
                                    className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                                />
                            </div>
                            <p className="text-[10px] text-ink-2 mt-1">A Apollo não filtra por ano nativamente — buscamos mais candidatos e filtramos localmente por fundação real.</p>
                        </div>
                        <div>
                            <span id="tech-included-label" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Tecnologias Utilizadas</span>
                            <div role="group" aria-labelledby="tech-included-label" className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-surface-2 rounded-xl border border-line">
                                {TECNOLOGIA_OPTIONS.map((opt) => {
                                    const selected = (criteria.tecnologias || '').split(',').filter(Boolean).includes(opt.value);
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                const current = (criteria.tecnologias || '').split(',').filter(Boolean);
                                                const next = selected ? current.filter((v) => v !== opt.value) : [...current, opt.value];
                                                setCriteria({ ...criteria, tecnologias: next.length ? next.join(',') : undefined });
                                            }}
                                            className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${selected ? 'bg-brand border-brand text-white' : 'bg-surface border-line text-ink-2 hover:border-brand/40'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-ink-2 mt-1">Lista curada e validada contra a API — a Apollo só filtra por identificador interno, não por nome livre.</p>
                        </div>
                        <div>
                            <span id="tech-excluded-label" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Excluir Tecnologias</span>
                            <div role="group" aria-labelledby="tech-excluded-label" className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-surface-2 rounded-xl border border-line">
                                {TECNOLOGIA_OPTIONS.map((opt) => {
                                    const selected = (criteria.tecnologiasExcluir || '').split(',').filter(Boolean).includes(opt.value);
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                const current = (criteria.tecnologiasExcluir || '').split(',').filter(Boolean);
                                                const next = selected ? current.filter((v) => v !== opt.value) : [...current, opt.value];
                                                setCriteria({ ...criteria, tecnologiasExcluir: next.length ? next.join(',') : undefined });
                                            }}
                                            className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${selected ? 'bg-danger border-danger text-white' : 'bg-surface-2 border-line text-ink-2 hover:border-danger/50'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-ink-2 mt-1">Útil para descartar empresas que já usam a solução de um concorrente, por exemplo.</p>
                        </div>
                        <div>
                            <label htmlFor="discovery-localizacao-excluir" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Excluir Localização</label>
                            <input
                                id="discovery-localizacao-excluir"
                                type="text"
                                placeholder="Ex: São Paulo, Minas Gerais"
                                value={criteria.localizacaoExcluir || ''}
                                onChange={(e) => setCriteria({ ...criteria, localizacaoExcluir: e.target.value || undefined })}
                                className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                            />
                            <p className="text-[10px] text-ink-2 mt-1">Cidades/estados a descartar, separados por vírgula.</p>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-ink-2 pt-1">
                            <input
                                type="checkbox"
                                checked={!!criteria.apenasCapitalAberto}
                                onChange={(e) => setCriteria({ ...criteria, apenasCapitalAberto: e.target.checked || undefined })}
                                className="rounded border-line text-brand focus:ring-brand"
                            />
                            Somente empresas de capital aberto (B3/bolsa)
                        </label>
                    </div>
                )}
            </div>

            <div className="pt-6 mt-2 relative z-10 border-t border-line">
                <button
                    id="btn-discover"
                    onClick={onDiscover}
                    disabled={isSearching}
                    className="w-full bg-brand text-white py-4 rounded-xl font-bold hover:bg-[#E04B12] disabled:opacity-80 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
                >
                    {isSearching ? (
                        <><Loader2 className="animate-spin" size={20} /> <span>⏳ Buscando...</span></>
                    ) : (
                        <><Cpu size={20} /> <span>🚀 Encontrar Leads Ideais</span></>
                    )}
                </button>
                {discoverError && <p className="text-xs text-red-600 mt-2">{discoverError}</p>}
            </div>
        </div>
    );
}
