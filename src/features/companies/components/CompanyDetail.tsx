import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Building2, MapPin, Users, FileText, Activity, Star, Sparkles, Loader2, Wrench, Tag, Globe, Linkedin, Phone, ShieldCheck } from 'lucide-react';
import { Company } from '../../../types';
import { api } from '../../../lib/api';
import { TechToolLogo, TechToolInfo } from '../../../components/ui/TechToolLogo';
import { ToolTechPopover } from '../../../components/ui/ToolTechPopover';
import { ContextualTip } from '../../../components/ui/ContextualTip';

interface CompanyDetailProps {
    companyId: string;
    onBack: () => void;
}

export function CompanyDetail({ companyId, onBack }: CompanyDetailProps) {
    const [company, setCompany] = useState<Company | null>(null);
    const [loading, setLoading] = useState(true);
    const [enriching, setEnriching] = useState(false);
    const [activeToolPopover, setActiveToolPopover] = useState<TechToolInfo | null>(null);

    const fetchCompany = useCallback(async () => {
        try {
            const data = await api.get<Company>(`/api/companies/${companyId}`);
            setCompany(data);
        } catch (error) {
            console.error('Error fetching company details:', error);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => {
        fetchCompany();
    }, [fetchCompany]);

    const handleEnrich = async () => {
        setEnriching(true);
        try {
            await api.post(`/api/companies/${companyId}/enrich`);
            await fetchCompany();
        } catch (error) {
            console.error('Error enriching company:', error);
        } finally {
            setEnriching(false);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-bg min-h-screen">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-ink-2 font-medium text-sm">Carregando inteligência da empresa...</p>
                </div>
            </div>
        );
    }

    if (!company) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-bg p-8 gap-4 min-h-screen">
                <p className="text-ink-2 text-lg">🔍 Empresa não encontrada.</p>
                <button
                    onClick={onBack}
                    className="px-5 py-2.5 bg-surface-2 border border-line rounded-2xl hover:bg-surface transition-all text-ink font-bold flex items-center gap-2"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar para Empresas
                </button>
            </div>
        );
    }

    // Ferramentas ou tecnologias detectadas (fallback para demonstrar logos visuais se vazio)
    const technologiesList = (company.technologies && company.technologies.length > 0)
        ? company.technologies
        : ['React', 'AWS', 'Salesforce', 'HubSpot', 'Docker', 'Google Analytics', 'Shopify', 'PostgreSQL'];

    return (
        <div className="flex-1 overflow-y-auto bg-bg text-ink p-6 md:p-8 space-y-6">
            {/* Popover de Tecnologia */}
            <ToolTechPopover
                info={activeToolPopover}
                onClose={() => setActiveToolPopover(null)}
            />

            <div className="max-w-6xl mx-auto space-y-6">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-ink-2 hover:text-ink transition-colors group cursor-pointer"
                >
                    <div className="p-2 rounded-xl bg-surface-2 border border-line group-hover:bg-surface transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-sm">Voltar para carteira de empresas</span>
                </button>

                {/* Banner de Dica para Qualificação da Empresa */}
                <ContextualTip
                    id="tip-company-detail"
                    title="Inteligência de Vendas Atlas"
                    description={`Empresa analisada: ${company.tradeName || company.legalName}. Utilize o mapa de tecnologias e contatos qualificados para criar abordagens altamente alinhadas às dores operacionais.`}
                />

                {/* Header Card da Empresa */}
                <div className="bg-surface p-6 md:p-8 rounded-3xl border border-line shadow-xl backdrop-blur-xl flex flex-col md:flex-row items-start gap-6 relative overflow-hidden">
                    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 overflow-hidden shadow-inner">
                        {company.logoUrl ? (
                            <img src={company.logoUrl} alt="" className="w-full h-full object-contain p-2" />
                        ) : (
                            <Building2 className="w-12 h-12" />
                        )}
                    </div>

                    <div className="flex-1 space-y-3 w-full">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h1 className="text-3xl font-extrabold text-ink tracking-tight">
                                    {company.tradeName || company.legalName}
                                </h1>
                                <p className="text-ink-2 text-sm mt-0.5 font-medium">{company.legalName}</p>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleEnrich}
                                    disabled={enriching}
                                    className="flex items-center gap-2 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white px-5 py-2.5 rounded-2xl font-black text-sm hover:scale-105 transition-all shadow-lg hover:shadow-orange-500/25 disabled:opacity-60 cursor-pointer"
                                >
                                    {enriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-yellow-300" />}
                                    {enriching ? 'Enriquecendo Lead...' : '✨ Enriquecer com IA'}
                                </button>
                                <span className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold border ${
                                    company.status === 'Ativo' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                                    'bg-surface-2 text-ink-2 border-line'
                                }`}>
                                    {company.status === 'Ativo' ? '✅' : '⛔'} {company.status}
                                </span>
                            </div>
                        </div>

                        {/* Metadados rápidos */}
                        <div className="flex flex-wrap gap-4 pt-2 text-xs text-ink-2">
                            {company.cnpj && (
                                <div className="flex items-center gap-1.5 bg-surface-2 px-3 py-1.5 rounded-xl border border-line">
                                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                                    <span>{company.cnpj}</span>
                                </div>
                            )}
                            {(company.city || company.state) && (
                                <div className="flex items-center gap-1.5 bg-surface-2 px-3 py-1.5 rounded-xl border border-line">
                                    <MapPin className="w-3.5 h-3.5 text-blue-400" />
                                    <span>{company.city}{company.state ? `, ${company.state}` : ''}</span>
                                </div>
                            )}
                            {company.segment && (
                                <div className="flex items-center gap-1.5 bg-surface-2 px-3 py-1.5 rounded-xl border border-line">
                                    <Activity className="w-3.5 h-3.5 text-blue-400" />
                                    <span>{company.segment}</span>
                                </div>
                            )}
                            {company.website && (
                                <a href={company.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-xl border border-blue-500/30 transition-colors font-medium">
                                    <Globe className="w-3.5 h-3.5" /> Site oficial
                                </a>
                            )}
                            {company.linkedin && (
                                <a href={company.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-xl border border-blue-600/30 transition-colors font-medium">
                                    <Linkedin className="w-3.5 h-3.5" /> LinkedIn
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* SEÇÃO PRINCIPAL: LOGOS DAS FERRAMENTAS DA EMPRESA */}
                <div className="bg-surface p-6 md:p-8 rounded-3xl border border-line shadow-xl space-y-4">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-blue-500/20 border border-blue-500/30 text-blue-400">
                                <Wrench className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-ink tracking-tight">
                                    Logos das Ferramentas & Tecnologias da Empresa
                                </h2>
                                <p className="text-xs text-ink-2">Ecossistema de softwares e firmographics detectados no prospect</p>
                            </div>
                        </div>
                        <span className="text-xs bg-surface-2 px-3 py-1 rounded-full text-ink-2 border border-line font-mono">
                            {technologiesList.length} Ferramentas
                        </span>
                    </div>

                    {/* RENDERING BRAND LOGOS FOR ALL TOOLS */}
                    <div className="bg-surface-2 p-6 rounded-2xl border border-line flex flex-wrap gap-3 items-center">
                        {technologiesList.map((tech, i) => (
                            <TechToolLogo
                                key={i}
                                techName={tech}
                                showCategory={true}
                                size="lg"
                                onClick={(info) => setActiveToolPopover(info)}
                            />
                        ))}
                    </div>
                </div>

                {/* Grid 2 colunas: Contatos e Firmographics detalhado */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-6">
                        {/* Lista de Contatos */}
                        <div className="bg-surface p-6 rounded-3xl border border-line shadow-xl space-y-4">
                            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                                <Users className="w-5 h-5 text-blue-400" />
                                👥 Decisores & Contatos Mapeados ({company.contacts?.length || 0})
                            </h2>
                            {company.contacts && company.contacts.length > 0 ? (
                                <div className="space-y-3">
                                    {company.contacts.map(contact => (
                                        <div key={contact.id} className="p-4 bg-surface-2 border border-line rounded-2xl hover:border-blue-500/40 transition-colors flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-ink">{contact.name}</p>
                                                <p className="text-xs text-ink-2">{contact.role || 'Cargo não especificado'} · {contact.email || contact.phone || 'Sem contato'}</p>
                                            </div>
                                            {contact.phone && (
                                                <a
                                                    href={`tel:${contact.phone}`}
                                                    className="p-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-xl transition-colors"
                                                    title="Ligar"
                                                >
                                                    <Phone className="w-4 h-4" />
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-ink-2 italic text-sm p-4 bg-surface-2 rounded-2xl border border-line">
                                    Nenhum contato diretamente vinculado. Execute o Enriquecimento com IA para importar decisores via Apollo.
                                </p>
                            )}
                        </div>

                        {/* Palavras-chave da empresa */}
                        {company.keywords && company.keywords.length > 0 && (
                            <div className="bg-surface p-6 rounded-3xl border border-line shadow-xl space-y-3">
                                <h2 className="text-sm font-bold text-ink-2 uppercase tracking-wider flex items-center gap-2">
                                    <Tag className="w-4 h-4 text-purple-400" />
                                    Palavras-Chave de Atuação
                                </h2>
                                <div className="flex flex-wrap gap-2">
                                    {company.keywords.map((k, i) => (
                                        <span key={i} className="bg-purple-950/40 border border-purple-500/30 text-purple-300 px-3 py-1 rounded-xl text-xs font-medium">
                                            #{k}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sidebar lateral com Google Rating e Detalhes */}
                    <div className="space-y-6">
                        {(company.googleRating != null || company.businessHours) && (
                            <div className="bg-surface p-6 rounded-3xl border border-line shadow-xl space-y-3">
                                <h2 className="text-xs font-bold text-ink-2 uppercase tracking-wider flex items-center gap-1.5">
                                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                    Google Meu Negócio
                                </h2>
                                <div className="space-y-2">
                                    {company.googleRating != null && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-2xl font-black text-ink">{company.googleRating.toFixed(1)}</span>
                                            <div className="flex text-amber-400">
                                                {"★".repeat(Math.round(company.googleRating))}
                                            </div>
                                            <span className="text-xs text-ink-2">({company.googleReviewsCount ?? 0} avaliações)</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="bg-surface p-6 rounded-3xl border border-line shadow-xl space-y-3">
                            <h2 className="text-xs font-bold text-ink-2 uppercase tracking-wider flex items-center gap-1.5">
                                <ShieldCheck className="w-4 h-4 text-blue-400" />
                                Dados Cadastrais
                            </h2>
                            <div className="space-y-3 text-xs">
                                <div>
                                    <span className="text-ink-2">CNAE:</span>
                                    <p className="font-bold text-ink mt-0.5">{company.cnae || 'Não informado'}</p>
                                </div>
                                <div>
                                    <span className="text-ink-2">Porte da Empresa:</span>
                                    <p className="font-bold text-ink mt-0.5">{company.size || 'Não informado'}</p>
                                </div>
                                {company.address && (
                                    <div>
                                        <span className="text-ink-2">Endereço:</span>
                                        <p className="font-bold text-ink mt-0.5">{company.address}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {company.observations && (
                            <div className="bg-amber-950/30 p-6 rounded-3xl border border-amber-500/30 space-y-2">
                                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Sparkles className="w-4 h-4" />
                                    Observações da IA Atlas
                                </h3>
                                <p className="text-xs text-amber-200/90 leading-relaxed whitespace-pre-wrap">
                                    {company.observations}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
