import { useState } from 'react';
import { CheckCircle2, Loader2, Mail, Phone, Search, ShieldCheck, User } from 'lucide-react';
import { api } from '../../../../../lib/api';
import { useBrand } from '../../../../../contexts/BrandContext';
import { normalizeCompanyDomain } from '../../../utils/domain';
import { getDecisionMakerLinkedInLink } from '../../../utils/linkedin';
import { getTelephoneLink, getWhatsAppLink } from '../../../../../shared/utils/contact-links';
import type { HunterPersonContact } from '../../../services/hunter.service';
import { NotConfiguredBanner } from './NotConfiguredBanner';
import { getErrorMessage, type PromoteResult } from './shared';

export function HunterTool({ configured }: { configured: boolean }) {
    const { brandInfo } = useBrand();
    const [domainInput, setDomainInput] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [contacts, setContacts] = useState<HunterPersonContact[] | null>(null);

    const [verifyName, setVerifyName] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [verifyResult, setVerifyResult] = useState<{ email: string | null; score?: number } | null>(null);

    const [promotingKey, setPromotingKey] = useState<string | null>(null);
    const [promoted, setPromoted] = useState<Record<string, PromoteResult>>({});

    const handleSearch = async () => {
        const domain = normalizeCompanyDomain(domainInput);
        if (!domain) {
            setError('Informe um domínio válido da empresa, como empresa.com.br.');
            return;
        }
        setDomainInput(domain);
        setIsSearching(true);
        setError(null);
        try {
            // Sem `limit` explícito: usa o default do backend (10), que já é o teto real do plano
            // gratuito do Hunter.io Domain Search — pedir mais que isso devolve 400 (pagination_error).
            const result = await api.post<{ contacts: HunterPersonContact[]; error?: string }>('/api/prospecting/tools/hunter', { domain }, { timeoutMs: 20_000 });
            setContacts(result.contacts);
            if (result.error) setError(result.error);
        } catch (err) {
            setError(getErrorMessage(err, 'Falha ao buscar no Hunter.io'));
        } finally {
            setIsSearching(false);
        }
    };

    const handleVerifyEmail = async () => {
        const domain = normalizeCompanyDomain(domainInput);
        if (!domain || !verifyName.trim()) {
            setError('Informe o domínio e o nome completo da pessoa para verificar o e-mail.');
            return;
        }
        setIsVerifying(true);
        setError(null);
        setVerifyResult(null);
        try {
            const result = await api.post<{ email: string | null; score?: number }>('/api/prospecting/tools/hunter/verify-email', { domain, fullName: verifyName }, { timeoutMs: 15_000 });
            setVerifyResult(result);
        } catch (err) {
            setError(getErrorMessage(err, 'Falha ao verificar e-mail'));
        } finally {
            setIsVerifying(false);
        }
    };

    const promoteContact = async (contact: HunterPersonContact, idx: number) => {
        const key = `hunter-${idx}`;
        setPromotingKey(key);
        try {
            const result = await api.post<PromoteResult>('/api/prospecting/promote', {
                tradeName: companyName.trim() || domainInput,
                source: `${brandInfo.name} — Ferramenta Hunter.io`,
                autoEnrich: false,
                website: domainInput,
                decisionMakers: [{
                    name: contact.name,
                    title: contact.title,
                    email: contact.email,
                    emailSource: 'hunter',
                    phone: contact.phone,
                    linkedinUrl: contact.linkedin_url,
                }],
                contact: { name: contact.name, role: contact.title || undefined },
            });
            setPromoted((prev) => ({ ...prev, [key]: result }));
        } catch (err) {
            setError(getErrorMessage(err, 'Falha ao adicionar ao CRM'));
        } finally {
            setPromotingKey(null);
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            <div className="xl:col-span-4 bg-surface p-6 rounded-2xl border border-line shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center text-brand">
                        <Mail size={18} />
                    </div>
                    <h2 className="font-black text-lg text-ink">Hunter.io</h2>
                </div>
                <p className="text-xs text-ink-2">Busca só no Hunter.io Domain Search — pessoas reais a partir de e-mails publicados num domínio.</p>

                {!configured && <NotConfiguredBanner envVar="HUNTER_API_KEY" />}

                <div>
                    <label htmlFor="hu-domain" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Domínio da empresa</label>
                    <input
                        id="hu-domain"
                        type="text"
                        placeholder="empresa.com.br"
                        className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                        value={domainInput}
                        onChange={(e) => setDomainInput(e.target.value)}
                    />
                </div>
                <div>
                    <label htmlFor="hu-empresa" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Nome da empresa (para salvar no CRM)</label>
                    <input
                        id="hu-empresa"
                        type="text"
                        placeholder="Opcional — usa o domínio se vazio"
                        className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                    />
                </div>

                <button
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="w-full bg-brand text-white py-3.5 rounded-xl font-bold hover:bg-[#E04B12] disabled:opacity-80 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
                >
                    {isSearching ? (<><Loader2 className="animate-spin" size={18} /> Buscando...</>) : (<><Search size={18} /> Buscar Pessoas</>)}
                </button>

                <div className="pt-3 mt-1 border-t border-line space-y-3">
                    <p className="text-[10px] tracking-wider font-bold uppercase text-ink-2">Verificar 1 e-mail específico</p>
                    <input
                        type="text"
                        placeholder="Nome completo da pessoa"
                        className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                        value={verifyName}
                        onChange={(e) => setVerifyName(e.target.value)}
                    />
                    <button
                        onClick={handleVerifyEmail}
                        disabled={isVerifying}
                        className="w-full bg-surface-2 border border-line text-ink py-2.5 rounded-xl font-bold text-xs hover:border-brand/40 disabled:opacity-70 transition-all flex items-center justify-center gap-2"
                    >
                        {isVerifying ? (<><Loader2 className="animate-spin" size={14} /> Verificando...</>) : (<><ShieldCheck size={14} /> Verificar E-mail</>)}
                    </button>
                    {verifyResult && (
                        <p className="text-xs text-ink-2">
                            {verifyResult.email
                                ? <>E-mail encontrado: <a href={`mailto:${verifyResult.email}`} className="text-success hover:underline">{verifyResult.email}</a>{verifyResult.score != null && ` (confiança ${verifyResult.score}%)`}</>
                                : 'Nenhum e-mail encontrado para este nome neste domínio.'}
                        </p>
                    )}
                </div>

                {error && <p className="text-xs text-danger">{error}</p>}
            </div>

            <div className="xl:col-span-8 space-y-3">
                {(!contacts || contacts.length === 0) && !isSearching && (
                    <div className="bg-surface p-8 rounded-2xl border border-dashed border-line text-center text-ink-2 text-sm">
                        {contacts?.length === 0 ? 'Nenhuma pessoa encontrada neste domínio.' : 'Nenhuma busca feita ainda — os resultados aparecem aqui.'}
                    </div>
                )}
                {contacts?.map((contact, idx) => {
                    const key = `hunter-${idx}`;
                    const isPromoted = !!promoted[key];
                    const linkedIn = getDecisionMakerLinkedInLink({
                        name: contact.name,
                        title: contact.title,
                        companyName: companyName.trim() || domainInput,
                        linkedinUrl: contact.linkedin_url,
                    });
                    return (
                        <div key={key} className="bg-surface p-5 rounded-2xl border border-line shadow-sm flex flex-wrap items-center gap-x-4 gap-y-2">
                            <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center text-brand shrink-0"><User size={16} /></div>
                            <div className="min-w-0">
                                <p className="font-bold text-sm text-ink">{contact.name}</p>
                                {contact.title && <p className="text-xs text-ink-2">{contact.title}</p>}
                            </div>
                            {contact.email && (
                                <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-xs text-success hover:underline"><Mail size={12} /> {contact.email}</a>
                            )}
                            {getTelephoneLink(contact.phone) && (
                                <a href={getTelephoneLink(contact.phone)} className="flex items-center gap-1 text-xs text-ink-2 hover:text-ink"><Phone size={12} /> {contact.phone}</a>
                            )}
                            {getWhatsAppLink(contact.phone) && (
                                <a href={getWhatsAppLink(contact.phone)} target="_blank" rel="noreferrer" className="text-xs text-emerald-500 hover:underline">WhatsApp</a>
                            )}
                            <a href={linkedIn.href} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">
                                {linkedIn.isDirectProfile ? 'Abrir perfil' : 'Buscar no LinkedIn'}
                            </a>
                            <div className="ml-auto">
                                {isPromoted ? (
                                    <span className="flex items-center gap-1.5 text-success font-bold text-xs"><CheckCircle2 size={14} /> No CRM</span>
                                ) : (
                                    <button
                                        onClick={() => promoteContact(contact, idx)}
                                        disabled={promotingKey === key}
                                        className="bg-brand text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-brand-active transition-all flex items-center gap-2 disabled:opacity-60"
                                    >
                                        {promotingKey === key ? <Loader2 className="animate-spin" size={13} /> : <ShieldCheck size={13} />}
                                        Salvar no CRM
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
