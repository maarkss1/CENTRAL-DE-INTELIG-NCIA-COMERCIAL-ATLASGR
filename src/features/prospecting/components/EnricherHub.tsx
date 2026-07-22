import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Company } from '../../../types';
import { api } from '../../../lib/api';
import { findLikelyWhatsapp, whatsappLink } from '../../../lib/phone';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { fadeInUp } from '../../../lib/motion';
import {
    IconSearch, IconSparkle, IconSpinner, IconBuilding, IconStar, IconClock, IconContacts,
    IconShieldCheck, IconMapPin, IconWrench, IconPhone, IconGlobe, IconLinkedin, IconInstagram,
    IconTwitterX, IconFacebook, IconMail, type AtlasIconProps,
} from '../../../components/icons';

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

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6 sm:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <motion.div variants={fadeInUp} initial="hidden" animate="show">
                    <h1 className="text-2xl font-black text-atlas-dark flex items-center gap-2.5">
                        <IconSparkle className="w-6 h-6 text-atlas-orange" />
                        Enriquecedor de Leads
                    </h1>
                    <p className="text-atlas-dark/50 mt-1">Busque uma empresa já cadastrada e rode o enriquecimento completo: Receita Federal + Google Negócios + Apollo.</p>
                </motion.div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                    <Card className="xl:col-span-4 p-6">
                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-atlas-dark/45">Buscar empresa</label>
                        <div className="relative mb-4">
                            <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-atlas-dark/30" />
                            <input
                                type="text"
                                placeholder="Nome, CNPJ, cidade, segmento..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 bg-black/[0.02] border border-black/5 rounded-xl text-sm focus:ring-2 focus:ring-atlas-orange/15 focus:border-atlas-orange/40 transition-all outline-none"
                            />
                        </div>

                        {searching && (
                            <div className="flex items-center gap-2 text-sm text-atlas-dark/45 py-4 justify-center">
                                <IconSpinner className="w-4 h-4 animate-spin text-atlas-orange" /> Buscando...
                            </div>
                        )}

                        {!searching && query.trim() && results.length === 0 && (
                            <p className="text-sm text-atlas-dark/45 text-center py-4">Nenhuma empresa encontrada.</p>
                        )}

                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                            {results.map((company) => (
                                <button
                                    key={company.id}
                                    onClick={() => handleSelect(company)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${selected?.id === company.id ? 'border-atlas-orange bg-atlas-orange/5' : 'border-black/5 hover:border-atlas-orange/40'}`}
                                >
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                                        <IconBuilding className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-atlas-dark text-sm truncate">{company.tradeName || company.legalName}</p>
                                        <p className="text-xs text-atlas-dark/45 truncate">{company.cnpj || company.city || 'Sem CNPJ'}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </Card>

                    <div className="xl:col-span-8">
                        {!selected ? (
                            <div className="bg-white rounded-2xl border border-dashed border-black/10 flex flex-col items-center justify-center p-10 min-h-[400px]">
                                <div className="bg-black/[0.02] w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5">
                                    <IconSparkle className="text-atlas-dark/20 w-8 h-8" />
                                </div>
                                <h3 className="font-black text-xl text-atlas-dark mb-2">Nenhuma empresa selecionada</h3>
                                <p className="text-sm text-atlas-dark/45 text-center max-w-sm">Busque e selecione uma empresa ao lado para rodar o enriquecimento completo.</p>
                            </div>
                        ) : (
                            <Card className="p-6 sm:p-8 space-y-6">
                                <div className="flex items-start justify-between flex-wrap gap-4">
                                    <div>
                                        <h3 className="font-black text-2xl text-atlas-dark">{selected.tradeName || selected.legalName}</h3>
                                        <p className="text-sm text-atlas-dark/45">{selected.legalName} · {selected.cnpj || 'Sem CNPJ'}</p>
                                        <div className="flex flex-wrap gap-3 mt-2 text-xs">
                                            {selected.phones?.[0] && <span className="flex items-center gap-1 text-atlas-dark/60"><IconPhone className="w-3 h-3" /> {selected.phones.join(' · ')}</span>}
                                            {selected.emails?.[0] && <span className="flex items-center gap-1 text-atlas-dark/60"><IconMail className="w-3 h-3" /> {selected.emails.join(' · ')}</span>}
                                            {findLikelyWhatsapp(selected.phones) && (
                                                <a href={whatsappLink(findLikelyWhatsapp(selected.phones)!)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-green-600 hover:underline">
                                                    <IconPhone className="w-3 h-3" /> WhatsApp provável
                                                </a>
                                            )}
                                            {selected.website && <a href={selected.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline"><IconGlobe className="w-3 h-3" /> Site</a>}
                                            {selected.linkedin && <a href={selected.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline"><IconLinkedin className="w-3 h-3" /> LinkedIn</a>}
                                            {selected.instagram && <a href={selected.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-pink-600 hover:underline"><IconInstagram className="w-3 h-3" /> Instagram</a>}
                                            {selected.twitter && <a href={selected.twitter} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sky-600 hover:underline"><IconTwitterX className="w-3 h-3" /> X/Twitter</a>}
                                            {selected.facebook && <a href={selected.facebook} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-700 hover:underline"><IconFacebook className="w-3 h-3" /> Facebook</a>}
                                        </div>
                                    </div>
                                    <Button variant="premium" size="lg" className="rounded-full" onClick={handleEnrich} disabled={enriching}>
                                        {enriching ? <IconSpinner className="w-4 h-4 mr-2 animate-spin" /> : <IconSparkle className="w-4 h-4 mr-2" />}
                                        {enriching ? 'Enriquecendo...' : 'Enriquecer com IA'}
                                    </Button>
                                </div>

                                {error && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>
                                )}

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <InfoTile icon={IconShieldCheck} label="Situação Cadastral" value={selected.situacaoCadastral || '-'} />
                                    <InfoTile icon={IconBuilding} label="CNAE" value={selected.cnae || '-'} />
                                    <InfoTile icon={IconMapPin} label="Localização" value={selected.city ? `${selected.city}, ${selected.state}` : '-'} />
                                    <InfoTile icon={IconContacts} label="Porte" value={selected.size || '-'} />
                                </div>

                                {selected.address && (
                                    <div>
                                        <p className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/45 mb-1 flex items-center gap-1">
                                            <IconMapPin className="w-3 h-3" /> Endereço completo
                                        </p>
                                        <p className="text-sm text-atlas-dark/70">{selected.address}{selected.zipCode ? ` — CEP ${selected.zipCode}` : ''}</p>
                                    </div>
                                )}

                                {selected.googleRating != null && (
                                    <div className="p-4 bg-yellow-50/60 border border-yellow-100 rounded-xl">
                                        <p className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/45 mb-2">Google Negócios</p>
                                        <div className="flex items-center gap-2 mb-1">
                                            <IconStar className="w-4 h-4 text-amber-400 fill-amber-400" />
                                            <span className="text-sm font-semibold text-atlas-dark">{selected.googleRating.toFixed(1)}</span>
                                            <span className="text-xs text-atlas-dark/45">({selected.googleReviewsCount ?? 0} avaliações)</span>
                                        </div>
                                        {selected.businessHours?.openNow != null && (
                                            <div className="flex items-center gap-2">
                                                <IconClock className="w-4 h-4 text-atlas-dark/35" />
                                                <span className="text-xs text-atlas-dark/60">{selected.businessHours.openNow ? 'Aberto agora' : 'Fechado agora'}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {selected.technologies && selected.technologies.length > 0 && (
                                    <div>
                                        <p className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/45 mb-2 flex items-center gap-1">
                                            <IconWrench className="w-3 h-3" /> Tecnologias (Apollo)
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {selected.technologies.slice(0, 12).map((t, idx) => (
                                                <span key={idx} className="bg-black/[0.02] border border-black/5 rounded-full px-2.5 py-1 text-xs text-atlas-dark/70">{t}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {enrichResult?.apolloContacts && enrichResult.apolloContacts.length > 0 && (
                                    <div>
                                        <p className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/45 mb-2 flex items-center gap-1">
                                            <IconContacts className="w-3 h-3" /> Decisores Descobertos (Apollo)
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {enrichResult.apolloContacts.map((contact, idx) => (
                                                <span key={idx} className="bg-black/[0.02] border border-black/5 rounded-full px-3 py-1 text-xs text-atlas-dark/70">
                                                    <strong>{contact.name}</strong>{contact.title && <span className="text-atlas-dark/40"> · {contact.title}</span>}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selected.observations && (
                                    <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl">
                                        <p className="text-[10px] tracking-wider font-bold uppercase text-indigo-500 mb-1">Resumo do Enriquecimento</p>
                                        <p className="text-xs text-atlas-dark/60 leading-relaxed">{selected.observations}</p>
                                    </div>
                                )}

                                {enrichResult?.fit && (
                                    <div className="pt-4 border-t border-black/5 flex items-center gap-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-atlas-dark/45">Fit Score:</span>
                                        <span className="bg-black/[0.03] text-atlas-dark/70 px-3 py-1 rounded-full text-xs font-bold">{enrichResult.fit.score}% · {enrichResult.fit.temperature}</span>
                                    </div>
                                )}
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function InfoTile({ icon: Icon, label, value }: { icon: React.ComponentType<AtlasIconProps>; label: string; value: string }) {
    return (
        <div className="bg-black/[0.02] rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-atlas-dark/35 mb-1">
                <Icon className="w-3 h-3" />
                <span className="text-[10px] tracking-wider font-bold uppercase">{label}</span>
            </div>
            <p className="text-sm font-bold text-atlas-dark truncate" title={value}>{value}</p>
        </div>
    );
}
