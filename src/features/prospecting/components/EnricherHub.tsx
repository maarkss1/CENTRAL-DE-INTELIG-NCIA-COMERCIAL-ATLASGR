import { useState, useEffect, useCallback } from 'react';
import { Search, Sparkles, Loader2, Building2, Star, Clock, Users, ShieldCheck, MapPin, Wrench, Phone, Globe, Linkedin, Instagram, Twitter, Facebook, Mail } from 'lucide-react';
import { Company } from '../../../types';
import { api } from '../../../lib/api';
import { findLikelyWhatsapp, whatsappLink } from '../../../lib/phone';

interface EnrichResult {
    company: Company;
    fit?: { score: number; temperature: string };
    apolloContacts?: Array<{ name: string; title: string | null; email: string | null }>;
}

export function EnricherHub() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Company[]>([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState<Company | null>(null);
    const [enriching, setEnriching] = useState(false);
    const [enrichResult, setEnrichResult] = useState<EnrichResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchCompanies = useCallback(async (q: string) => {
        setSearching(true);
        try {
            const res = await api.get<{ data: Company[] }>(`/api/companies?q=${encodeURIComponent(q)}&limit=10`);
            setResults(res.data);
        } catch (e) {
            console.error('Error searching companies:', e);
        } finally {
            setSearching(false);
        }
    }, []);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (query.trim()) fetchCompanies(query);
            else setResults([]);
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [query, fetchCompanies]);

    const handleSelect = (company: Company) => {
        setSelected(company);
        setEnrichResult(null);
        setError(null);
    };

    const handleEnrich = async () => {
        if (!selected) return;
        setEnriching(true);
        setError(null);
        try {
            const result = await api.post<EnrichResult>(`/api/companies/${selected.id}/enrich`);
            setEnrichResult(result);
            setSelected(result.company);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Falha ao enriquecer empresa');
        } finally {
            setEnriching(false);
        }
    };

    const handleCreateAndSelect = async () => {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const res = await api.post<Company>('/api/companies', {
                legalName: query,
                tradeName: query,
                status: 'Ativo'
            });
            setSelected(res);
            setEnrichResult(null);
            setError(null);
            setQuery('');
            setResults([]);
        } catch (e) {
            setError('Falha ao adicionar empresa para pesquisa.');
        } finally {
            setSearching(false);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6 sm:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div>
                    <h1 className="text-2xl font-black text-atlas-dark">🧪 AtlasGR Prospect AI</h1>
                    <p className="text-gray-500 mt-1">Busque uma empresa cadastrada ou prospecte uma nova para enriquecer com Receita Federal, OpenStreetMap e provedores opcionais configurados.</p>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                    <div className="xl:col-span-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-gray-500">Buscar empresa</label>
                        <div className="relative mb-4">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="🔎 Digite o nome ou CNPJ para pesquisar/prospectar..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 bg-gray-50/50 border border-gray-200 rounded-[2rem] text-sm focus:ring-2 focus:ring-atlas-orange/20 focus:border-atlas-orange transition-all outline-none"
                            />
                        </div>

                        {searching && (
                            <div className="flex items-center gap-2 text-sm text-gray-500 py-4 justify-center">
                                <Loader2 className="w-4 h-4 animate-spin" /> ⏳ Buscando...
                            </div>
                        )}

                        {!searching && query.trim() && results.length === 0 && (
                            <div className="text-center py-4 space-y-2">
                                <p className="text-sm text-gray-500">🔍 Nenhuma cadastrada encontrada.</p>
                            </div>
                        )}

                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                            {results.map((company) => (
                                <button
                                    key={company.id}
                                    onClick={() => handleSelect(company)}
                                    className={`w-full text-left p-3 rounded-[2rem] border transition-all flex items-center gap-3 ${selected?.id === company.id ? 'border-atlas-orange bg-orange-50/50' : 'border-gray-100 hover:border-atlas-orange/40'}`}
                                >
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                                        <Building2 className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-gray-900 text-sm truncate">{company.tradeName || company.legalName}</p>
                                        <p className="text-xs text-gray-500 truncate">{company.cnpj || company.city || 'Sem CNPJ'}</p>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {!searching && query.trim() && (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <button 
                                    onClick={handleCreateAndSelect}
                                    className="w-full py-2 bg-gray-100 hover:bg-atlas-orange hover:text-white text-gray-700 rounded-[2rem] text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    Prospectar: "{query}"
                                </button>
                            </div>
                        )}
                    </div>


                    <div className="xl:col-span-8">
                        {!selected ? (
                            <div className="bg-white rounded-[2.5rem] border border-dashed border-gray-200 flex flex-col items-center justify-center p-10 min-h-[400px]">
                                <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5">
                                    <Sparkles className="text-gray-300" size={32} />
                                </div>
                                <h3 className="font-black text-xl text-atlas-dark mb-2">Nenhuma empresa selecionada</h3>
                                <p className="text-sm text-gray-500 text-center max-w-sm">Busque e selecione uma empresa ao lado para rodar o enriquecimento completo.</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-6 sm:p-8 space-y-6">
                                <div className="flex items-start justify-between flex-wrap gap-4">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <button 
                                                onClick={() => setSelected(null)}
                                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                                                title="Voltar para busca"
                                            >
                                                ←
                                            </button>
                                            <h3 className="font-black text-2xl text-atlas-dark">{selected.tradeName || selected.legalName}</h3>
                                        </div>
                                        <p className="text-sm text-gray-500 ml-11">{selected.legalName} · {selected.cnpj || 'Sem CNPJ'}</p>
                                        <div className="flex flex-wrap gap-3 mt-2 text-xs">
                                            {selected.phones?.[0] && <span className="flex items-center gap-1 text-gray-600"><Phone size={12} /> {selected.phones.join(' · ')}</span>}
                                            {selected.emails?.[0] && <span className="flex items-center gap-1 text-gray-600"><Mail size={12} /> {selected.emails.join(' · ')}</span>}
                                            {findLikelyWhatsapp(selected.phones) && (
                                                <a href={whatsappLink(findLikelyWhatsapp(selected.phones)!)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-green-600 hover:underline">
                                                    <Phone size={12} /> WhatsApp provável
                                                </a>
                                            )}
                                            {selected.website && <a href={selected.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline"><Globe size={12} /> Site</a>}
                                            {selected.linkedin && <a href={selected.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline"><Linkedin size={12} /> LinkedIn</a>}
                                            {selected.instagram && <a href={selected.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-pink-600 hover:underline"><Instagram size={12} /> Instagram</a>}
                                            {selected.twitter && <a href={selected.twitter} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sky-600 hover:underline"><Twitter size={12} /> X/Twitter</a>}
                                            {selected.facebook && <a href={selected.facebook} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-700 hover:underline"><Facebook size={12} /> Facebook</a>}
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleEnrich}
                                        disabled={enriching}
                                        className="flex items-center gap-2 bg-gradient-to-r from-atlas-orange to-amber-500 text-white px-6 py-3 rounded-full font-bold text-sm hover:opacity-90 transition-all shadow-sm disabled:opacity-60"
                                    >
                                        {enriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                        {enriching ? '⏳ Enriquecendo...' : '✨ Enriquecer com IA'}
                                    </button>
                                </div>

                                {error && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>
                                )}

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <InfoTile icon={ShieldCheck} label="Situação Cadastral" value={selected.situacaoCadastral || '-'} />
                                    <InfoTile icon={Building2} label="CNAE" value={selected.cnae || '-'} />
                                    <InfoTile icon={MapPin} label="Localização" value={selected.city ? `${selected.city}, ${selected.state}` : '-'} />
                                    <InfoTile icon={Users} label="Porte" value={selected.size || '-'} />
                                </div>

                                {selected.address && (
                                    <div>
                                        <p className="text-[10px] tracking-wider font-bold uppercase text-gray-500 mb-1 flex items-center gap-1">
                                            <MapPin size={12} /> Endereço completo
                                        </p>
                                        <p className="text-sm text-gray-700">{selected.address}{selected.zipCode ? ` — CEP ${selected.zipCode}` : ''}</p>
                                    </div>
                                )}

                                {selected.googleRating != null && (
                                    <div className="p-4 bg-yellow-50/50 border border-yellow-100 rounded-xl">
                                        <p className="text-[10px] tracking-wider font-bold uppercase text-gray-500 mb-2">📍 Google Negócios</p>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                            <span className="text-sm font-semibold text-gray-900">{selected.googleRating.toFixed(1)}</span>
                                            <span className="text-xs text-gray-500">({selected.googleReviewsCount ?? 0} avaliações)</span>
                                        </div>
                                        {selected.businessHours?.openNow != null && (
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-gray-400" />
                                                <span className="text-xs text-gray-600">{selected.businessHours.openNow ? 'Aberto agora' : 'Fechado agora'}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {selected.technologies && selected.technologies.length > 0 && (
                                    <div>
                                        <p className="text-[10px] tracking-wider font-bold uppercase text-gray-500 mb-2 flex items-center gap-1">
                                            <Wrench size={12} /> Tecnologias (Apollo)
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {selected.technologies.slice(0, 12).map((t, idx) => (
                                                <span key={idx} className="bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 text-xs text-gray-700">{t}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {enrichResult?.apolloContacts && enrichResult.apolloContacts.length > 0 && (
                                    <div>
                                        <p className="text-[10px] tracking-wider font-bold uppercase text-gray-500 mb-2 flex items-center gap-1">
                                            <Users size={12} /> Decisores Descobertos (Apollo)
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {enrichResult.apolloContacts.map((contact, idx) => (
                                                <span key={idx} className="bg-gray-50 border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-700">
                                                    <strong>{contact.name}</strong>{contact.title && <span className="text-gray-400"> · {contact.title}</span>}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selected.observations && (
                                    <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                                        <p className="text-[10px] tracking-wider font-bold uppercase text-indigo-500 mb-1">📝 Resumo do Enriquecimento</p>
                                        <p className="text-xs text-gray-600 leading-relaxed">{selected.observations}</p>
                                    </div>
                                )}

                                {enrichResult?.fit && (
                                    <div className="pt-4 border-t border-gray-100 flex items-center gap-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Fit Score:</span>
                                        <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-bold">{enrichResult.fit.score}% · {enrichResult.fit.temperature}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
    return (
        <div className="bg-gray-50/70 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                <Icon size={12} />
                <span className="text-[10px] tracking-wider font-bold uppercase">{label}</span>
            </div>
            <p className="text-sm font-bold text-atlas-dark truncate" title={value}>{value}</p>
        </div>
    );
}
