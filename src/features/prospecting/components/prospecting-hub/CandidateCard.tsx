import { useState } from 'react';
import {
    TrendingUp, Building2, Users, MapPin, Calendar, DollarSign, Wrench, Mail,
    MessageCircle, Phone, Globe, Linkedin, Sparkles, CheckCircle2, Loader2, ShieldCheck, ThumbsDown,
} from 'lucide-react';
import type { FitScoreResult } from '../../services/enrichment.service';
import type { ProspectCandidate } from '../../services/prospecting.service';
import { getDecisionMakerLinkedInLink } from '../../utils/linkedin';
import {
    getTelephoneLink,
    getWhatsAppLink,
    validContactEmails,
} from '../../../../shared/utils/contact-links';
import { DecisionMakerSearch } from './DecisionMakerSearch';
import { WhatsAppChatPanel } from '../../../integrations/whatsapp/components/WhatsAppChatPanel';
import { api } from '../../../../lib/api';

interface PromoteResult {
    lead: { id: string };
    fit?: FitScoreResult;
    enrichment?: {
        company: {
            googleRating?: number;
            googleReviewsCount?: number;
            observations?: string;
        };
        apolloContacts?: Array<{ name: string; title: string | null; email: string | null; phone?: string | null; linkedin_url?: string | null }>;
    };
}

function formatUsd(value: number): string {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function CandidateCard({
    candidate, onPromote, isPromoting, promoted, promotedResult, isSelected, onToggleSelect, onReject, isRejecting
}: {
    isSelected?: boolean; onToggleSelect?: () => void;
    candidate: ProspectCandidate; onPromote: () => void; isPromoting: boolean; promoted: boolean; promotedResult?: PromoteResult;
    /** Marca o candidato como "Não é esse perfil" — passa a ser excluído de buscas futuras deste tenant. */
    onReject?: () => void;
    isRejecting?: boolean;
}) {
    const finalScore = promotedResult?.fit?.score ?? candidate.fitScoreEstimate;
    const isEstimate = !promotedResult?.fit;
    const enrichment = promotedResult?.enrichment;
    const [chatTarget, setChatTarget] = useState<{ phone: string; name: string } | null>(null);
    const [icebreakerText, setIcebreakerText] = useState<string | null>(candidate.icebreakerHook ?? null);
    const [isLoadingIcebreaker, setIsLoadingIcebreaker] = useState(false);

    const handleFetchIcebreaker = async () => {
        setIsLoadingIcebreaker(true);
        try {
            const res = await api.post<{ icebreaker: string }>('/api/prospecting/icebreaker', { companyName: candidate.tradeName });
            if (res?.icebreaker) {
                setIcebreakerText(res.icebreaker);
            } else {
                setIcebreakerText('Nenhuma notícia/fato recente encontrado via busca web.');
            }
        } catch {
            setIcebreakerText('Falha ao buscar fatos recentes na internet.');
        } finally {
            setIsLoadingIcebreaker(false);
        }
    };

    return (
        <div className="bg-surface p-6 rounded-2xl border border-line hover:border-brand/40 transition-all shadow-sm group">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="mt-1 mr-3"><input type="checkbox" className="rounded border-line text-brand focus:ring-brand w-5 h-5 cursor-pointer" checked={isSelected} onChange={onToggleSelect} /></div>
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="font-black text-lg text-ink group-hover:text-brand transition-colors">{candidate.tradeName}</h3>
                        {/* Tier de Fit é um sinal de negócio (score), não uma cor de marca — usa o
                            token semântico bg-warning/text-warning (mesmo já usado 2 linhas abaixo
                            pro badge de rating do Google), não atlas-yellow. */}
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${finalScore >= 75 ? 'bg-success/15 text-success' : finalScore >= 45 ? 'bg-info/15 text-info' : 'bg-warning/15 text-warning'}`}>
                            <TrendingUp size={10} /> Fit {finalScore}% {isEstimate && '(estimado)'}
                        </div>
                        {enrichment?.company.googleRating && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-warning/10 text-warning border border-warning/30">
                                ⭐ {enrichment.company.googleRating} Google ({enrichment.company.googleReviewsCount})
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs font-semibold text-ink-2 mb-2">
                        <span className="flex items-center gap-1.5"><Building2 size={14} className="text-ink-2" /> {candidate.segment}</span>
                        <span className="flex items-center gap-1.5"><Users size={14} className="text-ink-2" /> {candidate.size}</span>
                        <span className="flex items-center gap-1.5"><MapPin size={14} className="text-ink-2" /> {candidate.location}</span>
                        {candidate.foundedYear && (
                            <span className="flex items-center gap-1.5"><Calendar size={14} className="text-ink-2" /> Fundada em {candidate.foundedYear}</span>
                        )}
                        {candidate.annualRevenue != null && (
                            <span className="flex items-center gap-1.5"><DollarSign size={14} className="text-ink-2" /> {formatUsd(candidate.annualRevenue)}/ano</span>
                        )}
                        {candidate.phone && (
                            getTelephoneLink(candidate.phone) ? (
                                <a href={getTelephoneLink(candidate.phone)} className="flex items-center gap-1.5 hover:text-ink hover:underline">
                                    <Phone size={14} className="text-ink-2" /> {candidate.phone}
                                </a>
                            ) : (
                                <span className="flex items-center gap-1.5"><Phone size={14} className="text-ink-2" /> {candidate.phone}</span>
                            )
                        )}
                        {getWhatsAppLink(candidate.phone) && (
                            <button
                                type="button"
                                onClick={() => setChatTarget({ phone: candidate.phone!, name: candidate.tradeName })}
                                title="Número coletado — a existência de WhatsApp não foi verificada"
                                className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 hover:underline"
                            >
                                <MessageCircle size={14} /> WhatsApp
                            </button>
                        )}
                        {candidate.website && (
                            <a
                                href={candidate.website.startsWith('http') ? candidate.website : `https://${candidate.website}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 text-sky-400 hover:underline"
                            >
                                <Globe size={14} /> Site
                            </a>
                        )}
                        {candidate.linkedinUrl && (
                            <a href={candidate.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:underline">
                                <Linkedin size={14} /> LinkedIn
                            </a>
                        )}
                    </div>

                    {validContactEmails(candidate.emails).length > 0 && (
                        <div className="flex flex-wrap gap-3 text-xs font-semibold text-success mb-2">
                            {validContactEmails(candidate.emails).map((email) => (
                                <a key={email} href={`mailto:${email}`} className="flex items-center gap-1.5 hover:underline">
                                    <Mail size={14} /> {email}
                                </a>
                            ))}
                        </div>
                    )}

                    {candidate.technologies && candidate.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {candidate.technologies.map((tech, idx) => (
                                <span key={idx} className="flex items-center gap-1 bg-surface-2 border border-line rounded-full px-2 py-0.5 text-[10px] text-ink-2">
                                    <Wrench size={9} /> {tech}
                                </span>
                            ))}
                        </div>
                    )}

                    {!enrichment && candidate.rationale && (
                        <p className="text-xs text-ink-2 italic mb-2">&quot;{candidate.rationale}&quot;</p>
                    )}

                    {(icebreakerText || (candidate.webInsights && candidate.webInsights.length > 0)) ? (
                        <div className="my-3 p-3 bg-brand/10 border border-brand/20 rounded-xl">
                            <p className="text-[10px] tracking-wider font-bold uppercase text-brand mb-1 flex items-center gap-1">
                                <Sparkles size={12} /> ❄️ Quebra-Gelo / Notícia Recente (Busca Web)
                            </p>
                            {icebreakerText && (
                                <p className="text-xs text-ink font-medium leading-relaxed mb-1">{icebreakerText}</p>
                            )}
                            {candidate.webInsights && candidate.webInsights.length > 0 && (
                                <div className="mt-1 flex flex-col gap-1">
                                    {candidate.webInsights.slice(0, 3).map((news, idx) => (
                                        <a key={idx} href={news.url} target="_blank" rel="noreferrer" className="text-[11px] text-sky-500 hover:underline flex items-center gap-1 truncate">
                                            <Globe size={11} /> {news.title} <span className="text-[9px] text-ink-2">({news.domain})</span>
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="my-2">
                            <button
                                type="button"
                                onClick={handleFetchIcebreaker}
                                disabled={isLoadingIcebreaker}
                                className="text-[11px] font-semibold text-brand hover:underline flex items-center gap-1 bg-brand/5 border border-brand/20 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                            >
                                {isLoadingIcebreaker ? <Loader2 className="animate-spin" size={12} /> : <Sparkles size={12} />}
                                {isLoadingIcebreaker ? 'Buscando fatos recentes na internet...' : '🔍 Buscar Notícias / Quebra-Gelo Web'}
                            </button>
                        </div>
                    )}

                    {!enrichment && candidate.decisionMakers && candidate.decisionMakers.length > 0 && (
                        <div className="mt-2 mb-3">
                            <p className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2 flex items-center gap-1">
                                <Users size={12} /> Decisores já encontrados (Apollo/Hunter) — prontos para uso
                            </p>
                            <div className="flex flex-col gap-2">
                                {candidate.decisionMakers.map((dm, idx) => {
                                    const linkedIn = getDecisionMakerLinkedInLink({
                                        name: dm.name,
                                        title: dm.title,
                                        companyName: candidate.tradeName,
                                        linkedinUrl: dm.linkedinUrl,
                                    });
                                    const tel = getTelephoneLink(dm.phone);
                                    const whatsapp = getWhatsAppLink(dm.phone);
                                    return (
                                        <div key={idx} className="bg-surface-2 border border-line rounded-xl p-3 text-xs text-ink-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                            <strong className="text-ink text-sm">{dm.name}</strong>
                                            {dm.title && <span className="text-ink-2 bg-surface-2 px-2 py-0.5 rounded-md">{dm.title}</span>}
                                            {dm.email && (
                                                <a href={`mailto:${dm.email}`} className="flex items-center gap-1 text-success hover:underline">
                                                    <Mail size={12} /> {dm.email}
                                                    {dm.emailSource === 'hunter' ? (
                                                        <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full font-bold ml-1">HUNTER</span>
                                                    ) : dm.email.includes('@') ? (
                                                        <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold ml-1">✓ CONFIRMADO</span>
                                                    ) : (
                                                        <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-bold ml-1">💡 INFERIDO</span>
                                                    )}
                                                </a>
                                            )}
                                            {tel && (
                                                <a href={tel} className="flex items-center gap-1 text-ink-2 hover:text-ink hover:underline">
                                                    <Phone size={12} /> {dm.phone}
                                                </a>
                                            )}
                                            {whatsapp && (
                                                <button
                                                    type="button"
                                                    onClick={() => setChatTarget({ phone: dm.phone!, name: dm.name })}
                                                    title="Número coletado — a existência de WhatsApp não foi verificada"
                                                    className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline"
                                                >
                                                    <MessageCircle size={12} /> WhatsApp
                                                </button>
                                            )}
                                            <a href={linkedIn.href} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline">
                                                <Linkedin size={12} /> {linkedIn.isDirectProfile ? 'Abrir perfil' : 'Buscar no LinkedIn'}
                                            </a>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {!enrichment && candidate.decisionMakers?.length === 0 && (
                        <p className="text-[11px] text-ink-2 mb-3">
                            Nenhum decisor encontrado automaticamente para este domínio — seu plano Apollo pode não incluir People Search
                            {' '}e não há chave Hunter.io configurada. Você ainda pode tentar uma busca manual abaixo.
                        </p>
                    )}

                    <DecisionMakerSearch
                        companyName={candidate.tradeName}
                        website={candidate.website}
                        rationale={candidate.rationale}
                        companyCnpj={candidate.cnpjGuess}
                        companyEmails={candidate.emails}
                        companyPhones={candidate.phone ? [candidate.phone] : []}
                        alreadyFoundCount={candidate.decisionMakers?.length}
                    />

                    {enrichment?.company.observations && (
                        <div className="mt-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                            <p className="text-[10px] tracking-wider font-bold uppercase text-indigo-300 mb-1 flex items-center gap-1">
                                <Sparkles size={12} /> 📝 Resumo do Enriquecimento
                            </p>
                            <p className="text-xs text-ink-2 leading-relaxed">{enrichment.company.observations}</p>
                        </div>
                    )}

                    {enrichment?.apolloContacts && enrichment.apolloContacts.length > 0 && (
                        <div className="mt-3">
                            <p className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2 flex items-center gap-1">
                                <Users size={12} /> Decisores Descobertos (Apollo)
                            </p>
                            <div className="flex flex-col gap-3">
                                {enrichment.apolloContacts.map((contact, idx) => (
                                    <div key={idx} className="bg-surface-2 border border-line rounded-xl p-3 text-xs text-ink-2 flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <strong className="text-ink text-sm">{contact.name}</strong>
                                            {contact.linkedin_url && (
                                                <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">
                                                    LinkedIn
                                                </a>
                                            )}
                                        </div>
                                        {contact.title && <span className="text-ink-2">{contact.title}</span>}

                                        <div className="flex flex-wrap items-center gap-3 mt-1">
                                            {contact.email && (
                                                <span className="flex items-center gap-1.5 bg-surface-2 px-2 py-1 rounded-md">
                                                    <Mail size={12} className="text-ink-2" /> {contact.email}
                                                </span>
                                            )}
                                            {contact.phone && (
                                                <span className="flex items-center gap-1.5 bg-surface-2 px-2 py-1 rounded-md">
                                                    <Phone size={12} className="text-ink-2" /> {contact.phone}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                {promoted ? (
                    <span className="flex items-center gap-2 text-green-700 font-bold text-sm shrink-0"><CheckCircle2 size={16} /> ✅ No CRM</span>
                ) : (
                    <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto">
                        {onReject && (
                            <button
                                onClick={onReject}
                                disabled={isPromoting || isRejecting}
                                title="Descarta este candidato e o exclui de buscas futuras"
                                className="bg-surface-2 border border-line text-ink-2 px-4 py-2.5 rounded-xl font-bold text-xs hover:border-danger/50 hover:text-danger transition-all flex items-center gap-2 w-full sm:w-auto justify-center disabled:opacity-60 cursor-pointer"
                            >
                                {isRejecting ? <Loader2 className="animate-spin" size={15} /> : <ThumbsDown size={15} />}
                                {isRejecting ? 'Descartando...' : 'Não é esse perfil'}
                            </button>
                        )}
                        <button
                            onClick={onPromote}
                            disabled={isPromoting || isRejecting}
                            className="bg-brand text-white px-5 py-2.5 rounded-xl font-bold text-xs hover:bg-brand-active transition-all flex items-center gap-2 shadow-md hover:scale-[1.02] w-full sm:w-auto justify-center disabled:opacity-60 cursor-pointer"
                        >
                            {isPromoting ? <Loader2 className="animate-spin" size={15} /> : <ShieldCheck size={15} />}
                            {isPromoting ? '⏳ Enriquecendo...' : '✨ Enriquecer & Salvar no CRM'}
                        </button>
                    </div>
                )}
            </div>
            {chatTarget && (
                <WhatsAppChatPanel
                    phone={chatTarget.phone}
                    contactName={chatTarget.name}
                    onClose={() => setChatTarget(null)}
                />
            )}
        </div>
    );
}
