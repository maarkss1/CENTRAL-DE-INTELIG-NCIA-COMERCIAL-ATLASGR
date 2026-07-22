import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Company } from '../../../types';
import { api } from '../../../lib/api';
import { findLikelyWhatsapp, whatsappLink } from '../../../lib/phone';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { staggerContainer, staggerItem } from '../../../lib/motion';
import {
    IconArrowLeft, IconBuilding, IconMapPin, IconContacts, IconDocument, IconActivity, IconStar,
    IconClock, IconSparkle, IconSpinner, IconWrench, IconTag, IconGlobe, IconLinkedin, IconInstagram,
    IconTwitterX, IconFacebook, IconPhone, IconMail, IconCheck, IconClose, IconSearch,
} from '../../../components/icons';

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
                    <IconSpinner className="w-8 h-8 text-atlas-orange animate-spin" />
                    <p className="text-atlas-dark/50 font-medium">Carregando detalhes...</p>
                </div>
            </div>
        );
    }

    if (!company) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/50 gap-4">
                <IconSearch className="w-8 h-8 text-atlas-dark/20" />
                <p className="text-atlas-dark/50 text-lg">Empresa não encontrada.</p>
                <Button variant="outline" onClick={onBack}>
                    <IconArrowLeft className="w-4 h-4 mr-2" />
                    Voltar
                </Button>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-8">
            <motion.div variants={staggerContainer(0.06)} initial="hidden" animate="show" className="max-w-5xl mx-auto space-y-6">
                <motion.button variants={staggerItem} onClick={onBack} className="flex items-center gap-2 text-atlas-dark/50 hover:text-atlas-dark transition-colors mb-4 group">
                    <div className="p-1.5 rounded-lg group-hover:bg-black/5 transition-colors">
                        <IconArrowLeft className="w-4 h-4" />
                    </div>
                    <span className="font-medium">Voltar para empresas</span>
                </motion.button>

                <motion.div variants={staggerItem}>
                    <Card className="p-6 flex items-start gap-6">
                        <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 overflow-hidden">
                            {company.logoUrl ? (
                                <img src={company.logoUrl} alt="" className="w-full h-full object-contain" />
                            ) : (
                                <IconBuilding className="w-10 h-10" />
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-start flex-wrap gap-3">
                                <div>
                                    <h1 className="text-2xl font-bold text-atlas-dark">{company.tradeName || company.legalName}</h1>
                                    <p className="text-atlas-dark/50 mt-1">{company.legalName}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button variant="premium" onClick={handleEnrich} disabled={enriching}>
                                        {enriching ? <IconSpinner className="w-4 h-4 mr-2 animate-spin" /> : <IconSparkle className="w-4 h-4 mr-2" />}
                                        {enriching ? 'Enriquecendo...' : 'Enriquecer com IA'}
                                    </Button>
                                    <Badge variant={company.status === 'Ativo' ? 'success' : 'default'} className="h-fit">
                                        {company.status === 'Ativo' ? <IconCheck className="w-3 h-3" /> : <IconClose className="w-3 h-3" />}
                                        {company.status}
                                    </Badge>
                                </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-4 text-sm text-atlas-dark/60">
                                {company.cnpj && (
                                    <div className="flex items-center gap-1.5"><IconDocument className="w-4 h-4 text-atlas-dark/30" /> {company.cnpj}</div>
                                )}
                                {(company.city || company.state) && (
                                    <div className="flex items-center gap-1.5"><IconMapPin className="w-4 h-4 text-atlas-dark/30" /> {company.city}{company.state ? `, ${company.state}` : ''}</div>
                                )}
                                {company.segment && (
                                    <div className="flex items-center gap-1.5"><IconActivity className="w-4 h-4 text-atlas-dark/30" /> {company.segment}</div>
                                )}
                                {company.website && (
                                    <a href={company.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:underline"><IconGlobe className="w-4 h-4" /> Site</a>
                                )}
                                {company.linkedin && (
                                    <a href={company.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:underline"><IconLinkedin className="w-4 h-4" /> LinkedIn</a>
                                )}
                                {company.instagram && (
                                    <a href={company.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-pink-600 hover:underline"><IconInstagram className="w-4 h-4" /> Instagram</a>
                                )}
                                {company.twitter && (
                                    <a href={company.twitter} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sky-600 hover:underline"><IconTwitterX className="w-4 h-4" /> X/Twitter</a>
                                )}
                                {company.facebook && (
                                    <a href={company.facebook} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-700 hover:underline"><IconFacebook className="w-4 h-4" /> Facebook</a>
                                )}
                                {company.phones?.length > 0 && (
                                    <div className="flex items-center gap-1.5"><IconPhone className="w-4 h-4 text-atlas-dark/30" /> {company.phones.join(' · ')}</div>
                                )}
                                {company.emails?.length > 0 && (
                                    <div className="flex items-center gap-1.5"><IconMail className="w-4 h-4 text-atlas-dark/30" /> {company.emails.join(' · ')}</div>
                                )}
                                {findLikelyWhatsapp(company.phones) && (
                                    <a href={whatsappLink(findLikelyWhatsapp(company.phones)!)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-green-600 hover:underline">
                                        <IconPhone className="w-4 h-4" /> WhatsApp provável
                                    </a>
                                )}
                            </div>
                        </div>
                    </Card>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <motion.div variants={staggerItem} className="md:col-span-2 space-y-6">
                        <Card className="p-6">
                            <h2 className="text-lg font-semibold text-atlas-dark mb-4 flex items-center gap-2">
                                <IconContacts className="w-5 h-5 text-atlas-dark/35" /> Contatos ({company.contacts?.length || 0})
                            </h2>
                            {company.contacts && company.contacts.length > 0 ? (
                                <div className="space-y-3">
                                    {company.contacts.map(contact => (
                                        <div key={contact.id} className="p-4 border border-black/5 rounded-xl hover:border-black/10 transition-colors">
                                            <p className="font-medium text-atlas-dark">{contact.name}</p>
                                            <p className="text-sm text-atlas-dark/45">{contact.email || contact.phone || 'Sem contato registrado'}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-atlas-dark/40 italic text-sm">Nenhum contato cadastrado.</p>
                            )}
                        </Card>

                        <Card className="p-6">
                            <h2 className="text-lg font-semibold text-atlas-dark mb-4 flex items-center gap-2">
                                <IconActivity className="w-5 h-5 text-atlas-dark/35" /> Leads Relacionados ({company.leads?.length || 0})
                            </h2>
                            {company.leads && company.leads.length > 0 ? (
                                <div className="space-y-3">
                                    {company.leads.map(lead => (
                                        <div key={lead.id} className="p-4 border border-black/5 rounded-xl flex justify-between items-center">
                                            <p className="font-medium text-atlas-dark">{lead.status}</p>
                                            <span className="text-xs text-atlas-dark/35">{new Date(lead.updatedAt || lead.createdAt || '').toLocaleDateString()}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-atlas-dark/40 italic text-sm">Nenhum lead associado.</p>
                            )}
                        </Card>
                    </motion.div>

                    <motion.div variants={staggerItem} className="space-y-6">
                        {(company.googleRating != null || company.businessHours) && (
                            <Card className="p-6">
                                <h2 className="text-sm font-semibold text-atlas-dark uppercase tracking-wider mb-4 flex items-center gap-1.5">
                                    <IconMapPin className="w-4 h-4 text-atlas-dark/35" /> Google Negócios
                                </h2>
                                <div className="space-y-3">
                                    {company.googleRating != null && (
                                        <div className="flex items-center gap-2">
                                            <IconStar className="w-4 h-4 text-amber-400 fill-amber-400" />
                                            <span className="text-sm font-semibold text-atlas-dark">{company.googleRating.toFixed(1)}</span>
                                            <span className="text-xs text-atlas-dark/45">({company.googleReviewsCount ?? 0} avaliações)</span>
                                        </div>
                                    )}
                                    {company.businessHours?.openNow != null && (
                                        <div className="flex items-center gap-2">
                                            <IconClock className="w-4 h-4 text-atlas-dark/35" />
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${company.businessHours.openNow ? 'bg-green-50 text-green-700' : 'bg-black/5 text-atlas-dark/55'}`}>
                                                {company.businessHours.openNow ? 'Aberto agora' : 'Fechado agora'}
                                            </span>
                                        </div>
                                    )}
                                    {company.businessHours?.weekdayDescriptions && company.businessHours.weekdayDescriptions.length > 0 && (
                                        <ul className="text-xs text-atlas-dark/55 space-y-1">
                                            {company.businessHours.weekdayDescriptions.map((d, i) => (
                                                <li key={i}>{d}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </Card>
                        )}
                        {((company.technologies && company.technologies.length > 0) || (company.keywords && company.keywords.length > 0)) && (
                            <Card className="p-6">
                                <h2 className="text-sm font-semibold text-atlas-dark uppercase tracking-wider mb-4 flex items-center gap-1.5">
                                    <IconWrench className="w-4 h-4 text-atlas-dark/35" /> Firmographics (Apollo)
                                </h2>
                                <div className="space-y-4">
                                    {company.technologies && company.technologies.length > 0 && (
                                        <div>
                                            <p className="text-xs text-atlas-dark/45 mb-2 flex items-center gap-1"><IconWrench className="w-3.5 h-3.5" /> Tecnologias</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {company.technologies.slice(0, 12).map((t, i) => (
                                                    <span key={i} className="bg-black/[0.02] border border-black/5 rounded-full px-2.5 py-1 text-xs text-atlas-dark/70">{t}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {company.keywords && company.keywords.length > 0 && (
                                        <div>
                                            <p className="text-xs text-atlas-dark/45 mb-2 flex items-center gap-1"><IconTag className="w-3.5 h-3.5" /> Palavras-chave</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {company.keywords.slice(0, 10).map((k, i) => (
                                                    <span key={i} className="bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-1 text-xs text-indigo-700">{k}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        )}
                        <Card className="p-6">
                            <h2 className="text-sm font-semibold text-atlas-dark uppercase tracking-wider mb-4 flex items-center gap-1.5">
                                <IconDocument className="w-4 h-4 text-atlas-dark/35" /> Informações Adicionais
                            </h2>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs text-atlas-dark/45 mb-1">CNAE</p>
                                    <p className="text-sm font-medium text-atlas-dark">{company.cnae || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-atlas-dark/45 mb-1">Inscrição Estadual</p>
                                    <p className="text-sm font-medium text-atlas-dark">{company.stateRegistration || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-atlas-dark/45 mb-1">Tamanho</p>
                                    <p className="text-sm font-medium text-atlas-dark">{company.size || '-'}</p>
                                </div>
                                {company.address && (
                                    <div>
                                        <p className="text-xs text-atlas-dark/45 mb-1">Endereço</p>
                                        <p className="text-sm font-medium text-atlas-dark">{company.address}{company.zipCode ? ` — CEP ${company.zipCode}` : ''}</p>
                                    </div>
                                )}
                            </div>
                        </Card>
                        {company.observations && (
                            <div className="bg-yellow-50 p-6 rounded-2xl border border-yellow-100 elevation-1">
                                <h2 className="text-sm font-semibold text-yellow-800 uppercase tracking-wider mb-2">Observações (IA)</h2>
                                <p className="text-sm text-yellow-900 whitespace-pre-wrap">{company.observations}</p>
                            </div>
                        )}
                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
}
