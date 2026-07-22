import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Building2, MapPin, Users, FileText, Activity, Star, Clock, Sparkles, Loader2, Wrench, Tag, Globe, Linkedin, Instagram, Twitter, Facebook, Phone, Mail } from 'lucide-react';
import { Company } from '../../../types';
import { api } from '../../../lib/api';
import { findLikelyWhatsapp, whatsappLink } from '../../../lib/phone';

interface CompanyDetailProps {
    companyId: string;
    onBack: () => void;
}

export function CompanyDetail({ companyId, onBack }: CompanyDetailProps) {
    const [company, setCompany] = useState<Company | null>(null);
    const [loading, setLoading] = useState(true);
    const [enriching, setEnriching] = useState(false);

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
            <div className="flex-1 flex items-center justify-center bg-gray-50/50">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-500 font-medium">⏳ Carregando detalhes...</p>
                </div>
            </div>
        );
    }

    if (!company) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/50 gap-4">
                <p className="text-gray-500 text-lg">🔍 Empresa não encontrada.</p>
                <button onClick={onBack} className="px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm text-gray-700 font-medium flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Voltar
                </button>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-8">
            <div className="max-w-5xl mx-auto space-y-6">
                <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors mb-4 group">
                    <div className="p-1.5 rounded-lg group-hover:bg-gray-200 transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </div>
                    <span className="font-medium">Voltar para empresas</span>
                </button>

                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-start gap-6">
                    <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 overflow-hidden">
                        {company.logoUrl ? (
                            <img src={company.logoUrl} alt="" className="w-full h-full object-contain" />
                        ) : (
                            <Building2 className="w-10 h-10" />
                        )}
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">{company.tradeName || company.legalName}</h1>
                                <p className="text-gray-500 mt-1">{company.legalName}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleEnrich}
                                    disabled={enriching}
                                    className="flex items-center gap-2 bg-gradient-to-r from-atlas-orange to-amber-500 text-white px-4 py-2 rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-sm disabled:opacity-60"
                                >
                                    {enriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    {enriching ? 'Enriquecendo...' : '✨ Enriquecer com IA'}
                                </button>
                                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                    company.status === 'Ativo' ? 'bg-green-50 text-green-700 border border-green-200' :
                                    'bg-gray-100 text-gray-700 border border-gray-200'
                                }`}>
                                    {company.status === 'Ativo' ? '✅' : '⛔'} {company.status}
                                </span>
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-600">
                            {company.cnpj && (
                                <div className="flex items-center gap-1.5"><FileText className="w-4 h-4 text-gray-400" /> {company.cnpj}</div>
                            )}
                            {(company.city || company.state) && (
                                <div className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-gray-400" /> {company.city}{company.state ? `, ${company.state}` : ''}</div>
                            )}
                            {company.segment && (
                                <div className="flex items-center gap-1.5"><Activity className="w-4 h-4 text-gray-400" /> {company.segment}</div>
                            )}
                            {company.website && (
                                <a href={company.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:underline"><Globe className="w-4 h-4" /> Site</a>
                            )}
                            {company.linkedin && (
                                <a href={company.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:underline"><Linkedin className="w-4 h-4" /> LinkedIn</a>
                            )}
                            {company.instagram && (
                                <a href={company.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-pink-600 hover:underline"><Instagram className="w-4 h-4" /> Instagram</a>
                            )}
                            {company.twitter && (
                                <a href={company.twitter} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sky-600 hover:underline"><Twitter className="w-4 h-4" /> X/Twitter</a>
                            )}
                            {company.facebook && (
                                <a href={company.facebook} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-700 hover:underline"><Facebook className="w-4 h-4" /> Facebook</a>
                            )}
                            {company.phones?.length > 0 && (
                                <div className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-gray-400" /> {company.phones.join(' · ')}</div>
                            )}
                            {company.emails?.length > 0 && (
                                <div className="flex items-center gap-1.5"><Mail className="w-4 h-4 text-gray-400" /> {company.emails.join(' · ')}</div>
                            )}
                            {findLikelyWhatsapp(company.phones) && (
                                <a href={whatsappLink(findLikelyWhatsapp(company.phones)!)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-green-600 hover:underline">
                                    <Phone className="w-4 h-4" /> WhatsApp provável
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-6">
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <Users className="w-5 h-5 text-gray-400" /> 👥 Contatos ({company.contacts?.length || 0})
                            </h2>
                            {company.contacts && company.contacts.length > 0 ? (
                                <div className="space-y-3">
                                    {company.contacts.map(contact => (
                                        <div key={contact.id} className="p-4 border border-gray-100 rounded-xl hover:border-gray-200 transition-colors">
                                            <p className="font-medium text-gray-900">{contact.name}</p>
                                            <p className="text-sm text-gray-500">{contact.email || contact.phone || 'Sem contato registrado'}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-500 italic text-sm">Nenhum contato cadastrado.</p>
                            )}
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-gray-400" /> 🎯 Leads Relacionados ({company.leads?.length || 0})
                            </h2>
                            {company.leads && company.leads.length > 0 ? (
                                <div className="space-y-3">
                                    {company.leads.map(lead => (
                                        <div key={lead.id} className="p-4 border border-gray-100 rounded-xl flex justify-between items-center">
                                            <p className="font-medium text-gray-900">{lead.status}</p>
                                            <span className="text-xs text-gray-400">{new Date(lead.updatedAt || lead.createdAt || '').toLocaleDateString()}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-500 italic text-sm">Nenhum lead associado.</p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        {(company.googleRating != null || company.businessHours) && (
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">📍 Google Negócios</h2>
                                <div className="space-y-3">
                                    {company.googleRating != null && (
                                        <div className="flex items-center gap-2">
                                            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                            <span className="text-sm font-semibold text-gray-900">{company.googleRating.toFixed(1)}</span>
                                            <span className="text-xs text-gray-500">({company.googleReviewsCount ?? 0} avaliações)</span>
                                        </div>
                                    )}
                                    {company.businessHours?.openNow != null && (
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-gray-400" />
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${company.businessHours.openNow ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                {company.businessHours.openNow ? 'Aberto agora' : 'Fechado agora'}
                                            </span>
                                        </div>
                                    )}
                                    {company.businessHours?.weekdayDescriptions && company.businessHours.weekdayDescriptions.length > 0 && (
                                        <ul className="text-xs text-gray-600 space-y-1">
                                            {company.businessHours.weekdayDescriptions.map((d, i) => (
                                                <li key={i}>{d}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        )}
                        {((company.technologies && company.technologies.length > 0) || (company.keywords && company.keywords.length > 0)) && (
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">🔧 Firmographics (Apollo)</h2>
                                <div className="space-y-4">
                                    {company.technologies && company.technologies.length > 0 && (
                                        <div>
                                            <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Wrench className="w-3.5 h-3.5" /> Tecnologias</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {company.technologies.slice(0, 12).map((t, i) => (
                                                    <span key={i} className="bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 text-xs text-gray-700">{t}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {company.keywords && company.keywords.length > 0 && (
                                        <div>
                                            <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Palavras-chave</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {company.keywords.slice(0, 10).map((k, i) => (
                                                    <span key={i} className="bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-1 text-xs text-indigo-700">{k}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">📋 Informações Adicionais</h2>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">CNAE</p>
                                    <p className="text-sm font-medium text-gray-900">{company.cnae || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Inscrição Estadual</p>
                                    <p className="text-sm font-medium text-gray-900">{company.stateRegistration || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Tamanho</p>
                                    <p className="text-sm font-medium text-gray-900">{company.size || '-'}</p>
                                </div>
                                {company.address && (
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">Endereço</p>
                                        <p className="text-sm font-medium text-gray-900">{company.address}{company.zipCode ? ` — CEP ${company.zipCode}` : ''}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        {company.observations && (
                            <div className="bg-yellow-50 p-6 rounded-2xl border border-yellow-100 shadow-sm">
                                <h2 className="text-sm font-semibold text-yellow-800 uppercase tracking-wider mb-2">💬 Observações (IA)</h2>
                                <p className="text-sm text-yellow-900 whitespace-pre-wrap">{company.observations}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
