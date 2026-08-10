import { useState, useEffect } from 'react';
import {
    Search, Users, Building2, Globe, Mail, Phone, MessageCircle, Linkedin, Loader2,
} from 'lucide-react';
import { api } from '../../../../lib/api';
import type { DecisionMaker } from '../../services/prospecting.service';
import type { DecisionMakerCriteria } from '../../services/apollo.service';
import { ATLAS_PERSONA_OPTIONS, TOTALTRAC_PERSONA_OPTIONS } from '../../../../shared/constants/icp-options';
import { useBrand } from '../../../../contexts/BrandContext';
import { findCompanyDomain, normalizeCompanyDomain } from '../../utils/domain';
import { getDecisionMakerLinkedInLink } from '../../utils/linkedin';
import {
    getTelephoneLink,
    getWhatsAppLink,
    validContactEmails,
    validContactPhones,
} from '../../../../shared/utils/contact-links';

function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

interface DecisionMakerSearchProps {
    companyName: string;
    website?: string | null;
    rationale?: string | null;
    companyCnpj?: string | null;
    companyEmails?: Array<string | null | undefined> | null;
    companyPhones?: Array<string | null | undefined> | null;
    appearance?: 'dark' | 'light';
    /** Quantidade de decisores já encontrados automaticamente na descoberta — ajusta o texto do botão para deixar claro que isto é uma busca adicional, não a única forma de ver decisores. */
    alreadyFoundCount?: number;
}

export function DecisionMakerSearch({
    companyName,
    website,
    rationale,
    companyCnpj,
    companyEmails,
    companyPhones,
    appearance = 'dark',
    alreadyFoundCount,
}: DecisionMakerSearchProps) {
    const { activeBrand, brandInfo } = useBrand();
    const light = appearance === 'light';
    const personaOptions = activeBrand === 'totaltrac' ? TOTALTRAC_PERSONA_OPTIONS : ATLAS_PERSONA_OPTIONS;
    const [open, setOpen] = useState(false);
    const [criteria, setCriteria] = useState<DecisionMakerCriteria>({
        apenasEmailVerificado: true,
        senioridades: [],
        departamentos: [],
    });
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<DecisionMaker[] | null>(null);
    const [selectedDecisionMaker, setSelectedDecisionMaker] = useState<DecisionMaker | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [icebreakers, setIcebreakers] = useState<Record<number, { loading: boolean; text?: string; error?: string }>>({});
    const detectedDomain = findCompanyDomain(website, rationale);
    const [domainInput, setDomainInput] = useState(detectedDomain);
    const normalizedCompanyEmails = validContactEmails(companyEmails);
    const normalizedCompanyPhones = validContactPhones(companyPhones);

    useEffect(() => {
        setDomainInput(detectedDomain);
        setResults(null);
        setSelectedDecisionMaker(null);
        setError(null);
    }, [companyName, detectedDomain]);

    const SENIORITY_OPTIONS = [
        { value: 'c_suite', label: 'C-Level' },
        { value: 'vp', label: 'VP' },
        { value: 'director', label: 'Diretor' },
        { value: 'manager', label: 'Gerente' },
        { value: 'senior', label: 'Sênior' },
    ];

    const DEPARTMENT_OPTIONS = [
        { value: 'sales', label: 'Vendas' },
        { value: 'marketing', label: 'Marketing' },
        { value: 'it', label: 'Tecnologia' },
        { value: 'engineering', label: 'Engenharia' },
        { value: 'hr', label: 'RH' },
        { value: 'operations', label: 'Operações' },
    ];

    const toggleSeniority = (v: string) => {
        setCriteria(c => ({
            ...c,
            senioridades: c.senioridades?.includes(v) ? c.senioridades.filter(x => x !== v) : [...(c.senioridades || []), v]
        }));
    };

    type PersonaOption = { label: string; nivel: string; titles: string; seniorities: readonly string[] };

    const isPersonaActive = (persona: PersonaOption) => {
        const currentTitles = (criteria.cargos || '').split(',').map((t) => t.trim()).filter(Boolean);
        return persona.titles.split(',').every((t) => currentTitles.includes(t));
    };

    const togglePersona = (persona: PersonaOption) => {
        setCriteria((c) => {
            const currentTitles = (c.cargos || '').split(',').map((t) => t.trim()).filter(Boolean);
            const personaTitles = persona.titles.split(',');
            const active = personaTitles.every((t) => currentTitles.includes(t));
            const nextTitles = active
                ? currentTitles.filter((t) => !personaTitles.includes(t))
                : Array.from(new Set([...currentTitles, ...personaTitles]));
            const nextSeniorities = active
                ? (c.senioridades || []).filter((s) => !(persona.seniorities as readonly string[]).includes(s))
                : Array.from(new Set([...(c.senioridades || []), ...persona.seniorities]));
            return { ...c, cargos: nextTitles.length ? nextTitles.join(',') : undefined, senioridades: nextSeniorities };
        });
    };

    const toggleDepartment = (v: string) => {
        setCriteria(c => ({
            ...c,
            departamentos: c.departamentos?.includes(v) ? c.departamentos.filter(x => x !== v) : [...(c.departamentos || []), v]
        }));
    };

    const handleSearch = async () => {
        const domain = normalizeCompanyDomain(domainInput);
        if (!domain) {
            setError('Informe um domínio válido da empresa, como empresa.com.br.');
            return;
        }
        setDomainInput(domain);
        setIsSearching(true);
        setSelectedDecisionMaker(null);
        setError(null);
        try {
            // Apollo People Search (15s) + fallback/complemento Hunter.io por contato sem e-mail —
            // pode passar dos 15s padrão em domínios com muitos decisores.
            const res = await api.post<{ decisionMakers: DecisionMaker[], error?: string }>('/api/prospecting/decision-makers', {
                domain,
                criteria
            }, { timeoutMs: 30_000 });
            setResults(res.decisionMakers);
            if (res.error) setError(res.error);
        } catch (err) {
            setError(getErrorMessage(err, 'Falha ao buscar decisores.'));
        } finally {
            setIsSearching(false);
        }
    };

    const handleGenerateIcebreaker = async (idx: number) => {
        setIcebreakers((prev) => ({ ...prev, [idx]: { loading: true } }));
        try {
            // Faz scraping headless (Playwright + DuckDuckGo) antes de chamar a IA — bem mais lento
            // que uma geração de texto simples, precisa de bastante folga sobre os 15s padrão.
            const res = await api.post<{ icebreaker: string }>('/api/prospecting/icebreaker', { companyName }, { timeoutMs: 60_000 });
            setIcebreakers((prev) => ({
                ...prev,
                [idx]: res.icebreaker
                    ? { loading: false, text: res.icebreaker }
                    : { loading: false, error: 'Não encontramos contexto público suficiente para gerar um quebra-gelo agora.' },
            }));
        } catch (err) {
            setIcebreakers((prev) => ({ ...prev, [idx]: { loading: false, error: getErrorMessage(err, 'Falha ao gerar quebra-gelo.') } }));
        }
    };

    const selectedLinkedIn = selectedDecisionMaker
        ? getDecisionMakerLinkedInLink({
            name: selectedDecisionMaker.name,
            title: selectedDecisionMaker.title,
            companyName,
            linkedinUrl: selectedDecisionMaker.linkedinUrl,
        })
        : null;
    const selectedTelephoneLink = getTelephoneLink(selectedDecisionMaker?.phone);
    const selectedWhatsAppLink = getWhatsAppLink(selectedDecisionMaker?.phone);

    if (!open) {
        return (
            <div className="mt-3">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className={`text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
                        light
                            ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                            : 'bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25'
                    }`}
                >
                    <Search size={14} /> {alreadyFoundCount ? 'Buscar mais decisores (outros filtros)' : 'Buscar Decisores Nesta Empresa'}
                </button>
            </div>
        );
    }

    return (
        <div className={`mt-4 p-4 border rounded-2xl ${light ? 'border-indigo-400/40 bg-surface-2 text-ink' : 'border-indigo-500/20 bg-indigo-500/5'}`}>
            <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-sm text-indigo-300 flex items-center gap-2"><Users size={16} /> Pesquisa de Decisores (Apollo)</h4>
                <button type="button" onClick={() => setOpen(false)} className="text-ink-2 hover:text-ink text-xs">Fechar</button>
            </div>

            <div className="mb-4">
                <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Domínio da empresa</label>
                <input
                    type="text"
                    placeholder="empresa.com.br"
                    value={domainInput}
                    onChange={(event) => {
                        setDomainInput(event.target.value);
                        setError(null);
                    }}
                    className="w-full p-2.5 bg-surface rounded-xl border border-line outline-none focus:border-indigo-400 text-sm"
                />
                <p className="text-[10px] text-ink-2 mt-1">
                    {detectedDomain
                        ? 'Domínio identificado automaticamente pelo site da empresa.'
                        : 'Não encontramos um site automaticamente. Informe o domínio para consultar os decisores.'}
                </p>
            </div>

            <div className="mb-4 rounded-xl border border-line bg-surface-2 p-3">
                <h5 className="text-[10px] tracking-wider font-bold uppercase text-indigo-300 mb-2 flex items-center gap-1.5">
                    <Building2 size={13} /> Dados disponíveis da empresa
                </h5>
                <p className="font-bold text-sm text-ink mb-2">{companyName}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-surface-2 p-2">
                        <span className="block text-[9px] uppercase tracking-wider text-ink-2 mb-1">CNPJ</span>
                        <span className="text-ink">{companyCnpj || 'Não encontrado'}</span>
                    </div>
                    <div className="rounded-lg bg-surface-2 p-2">
                        <span className="block text-[9px] uppercase tracking-wider text-ink-2 mb-1">Site</span>
                        {detectedDomain ? (
                            <a href={`https://${detectedDomain}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
                                <Globe size={12} /> {detectedDomain}
                            </a>
                        ) : (
                            <span className="text-ink-2">Não encontrado</span>
                        )}
                    </div>
                    <div className="rounded-lg bg-surface-2 p-2 sm:col-span-2">
                        <span className="block text-[9px] uppercase tracking-wider text-ink-2 mb-1">E-mails da empresa</span>
                        {normalizedCompanyEmails.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {normalizedCompanyEmails.map((email) => (
                                    <a key={email} href={`mailto:${email}`} className="text-success hover:underline flex items-center gap-1">
                                        <Mail size={12} /> {email}
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <span className="text-ink-2">Não encontrado</span>
                        )}
                    </div>
                    <div className="rounded-lg bg-surface-2 p-2 sm:col-span-2">
                        <span className="block text-[9px] uppercase tracking-wider text-ink-2 mb-1">Telefones e WhatsApp da empresa</span>
                        {normalizedCompanyPhones.length > 0 ? (
                            <div className="flex flex-wrap gap-x-3 gap-y-2">
                                {normalizedCompanyPhones.map((phone) => (
                                    <span key={phone} className="flex flex-wrap items-center gap-2">
                                        <a href={getTelephoneLink(phone)} className="text-ink hover:text-ink hover:underline flex items-center gap-1">
                                            <Phone size={12} /> {phone}
                                        </a>
                                        <a
                                            href={getWhatsAppLink(phone)}
                                            target="_blank"
                                            rel="noreferrer"
                                            title="O número foi coletado, mas a existência de WhatsApp não foi verificada"
                                            className="text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1"
                                        >
                                            <MessageCircle size={12} /> Tentar WhatsApp
                                        </a>
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="text-ink-2">Não encontrado</span>
                        )}
                    </div>
                </div>
                <p className="text-[9px] text-ink-2 mt-2">WhatsApp é um atalho não verificado; nenhum número é inventado.</p>
            </div>

            <div className="mb-4">
                <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Personas {brandInfo.name} (Playbook de Pré-Vendas)</label>
                <div className="flex flex-wrap gap-1.5">
                    {personaOptions.map((persona) => {
                        const active = isPersonaActive(persona);
                        return (
                            <button
                                key={persona.label}
                                type="button"
                                onClick={() => togglePersona(persona)}
                                title={persona.nivel}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-surface border-line text-ink-2 hover:border-indigo-300'}`}
                            >
                                {persona.label}
                            </button>
                        );
                    })}
                </div>
                <p className="text-[10px] text-ink-2 mt-1">Direto da tabela &quot;Contatos ideais&quot; do Playbook — cada clique já ajusta cargo e senioridade.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Cargos Específicos (Vírgula)</label>
                    <input
                        type="text"
                        placeholder="Ex: Diretor de Logística, CEO"
                        value={criteria.cargos || ''}
                        onChange={(e) => setCriteria({ ...criteria, cargos: e.target.value || undefined })}
                        className="w-full p-2.5 bg-surface rounded-xl border border-line outline-none focus:border-indigo-400 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Palavras-chave (Perfil LinkedIn)</label>
                    <input
                        type="text"
                        placeholder="Ex: agile, supply chain"
                        value={criteria.palavrasChavePerfil || ''}
                        onChange={(e) => setCriteria({ ...criteria, palavrasChavePerfil: e.target.value || undefined })}
                        className="w-full p-2.5 bg-surface rounded-xl border border-line outline-none focus:border-indigo-400 text-sm"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Níveis de Senioridade</label>
                    <div className="flex flex-wrap gap-2">
                        {SENIORITY_OPTIONS.map(opt => (
                            <button
                                type="button"
                                key={opt.value}
                                onClick={() => toggleSeniority(opt.value)}
                                className={`px-2 py-1 rounded-md text-xs font-medium border ${criteria.senioridades?.includes(opt.value) ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300' : 'bg-surface border-line text-ink-2'}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Departamentos</label>
                    <div className="flex flex-wrap gap-2">
                        {DEPARTMENT_OPTIONS.map(opt => (
                            <button
                                type="button"
                                key={opt.value}
                                onClick={() => toggleDepartment(opt.value)}
                                className={`px-2 py-1 rounded-md text-xs font-medium border ${criteria.departamentos?.includes(opt.value) ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300' : 'bg-surface border-line text-ink-2'}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="flex gap-2">

                <div className="flex-1">
                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Cidade (opcional)</label>
                        <input
                            type="text"
                            value={criteria.cidade || ''}
                            onChange={(e) => setCriteria({ ...criteria, cidade: e.target.value || undefined })}
                            className="w-full p-2.5 bg-surface rounded-xl border border-line outline-none focus:border-indigo-400 text-sm"
                        />
                    </div>

                <div className="flex-1">
                        <label className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Estado (opcional)</label>
                        <input
                            type="text"
                            value={criteria.estado || ''}
                            onChange={(e) => setCriteria({ ...criteria, estado: e.target.value || undefined })}
                            className="w-full p-2.5 bg-surface rounded-xl border border-line outline-none focus:border-indigo-400 text-sm"
                        />
                    </div>
                </div>
                <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-ink-2">
                        <input
                            type="checkbox"
                            checked={criteria.apenasEmailVerificado}
                            onChange={(e) => setCriteria({ ...criteria, apenasEmailVerificado: e.target.checked })}
                            className="rounded border-line text-indigo-500 focus:ring-indigo-500"
                        />
                        Somente e-mails verificados
                    </label>
                </div>
            </div>

            <button
                type="button"
                onClick={handleSearch}
                disabled={isSearching || !normalizeCompanyDomain(domainInput)}
                className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {isSearching ? 'Buscando pessoas...' : 'Buscar Pessoas'}
            </button>

            {error && <p className="text-xs text-danger mt-3">{error}</p>}

            {results && (
                <div className="mt-4 border-t border-indigo-100 pt-4">
                    <h5 className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-3">Resultados ({results.length})</h5>
                    {selectedDecisionMaker && selectedLinkedIn && (
                        <div className="mb-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div>
                                    <p className="text-[9px] uppercase tracking-wider font-bold text-indigo-300 mb-1">Perfil consolidado dentro da ferramenta</p>
                                    <h6 className="font-black text-lg text-ink">{selectedDecisionMaker.name}</h6>
                                    <p className="text-xs text-ink-2">{selectedDecisionMaker.title || 'Cargo não encontrado'} · {companyName}</p>
                                </div>
                                <button type="button" onClick={() => setSelectedDecisionMaker(null)} className="text-xs text-ink-2 hover:text-ink">
                                    Fechar perfil
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div className="rounded-xl bg-surface-2 p-3">
                                    <span className="block text-[9px] uppercase tracking-wider text-ink-2 mb-1">E-mail do decisor</span>
                                    {selectedDecisionMaker.email ? (
                                        <a href={`mailto:${selectedDecisionMaker.email}`} className="text-success hover:underline flex items-center gap-1">
                                            <Mail size={12} /> {selectedDecisionMaker.email}
                                        </a>
                                    ) : (
                                        <span className="text-ink-2">Não encontrado</span>
                                    )}
                                </div>
                                <div className="rounded-xl bg-surface-2 p-3">
                                    <span className="block text-[9px] uppercase tracking-wider text-ink-2 mb-1">Telefone do decisor</span>
                                    {selectedTelephoneLink ? (
                                        <a href={selectedTelephoneLink} className="text-ink hover:underline flex items-center gap-1">
                                            <Phone size={12} /> {selectedDecisionMaker.phone}
                                        </a>
                                    ) : (
                                        <span className="text-ink-2">Não encontrado</span>
                                    )}
                                </div>
                                <div className="rounded-xl bg-surface-2 p-3">
                                    <span className="block text-[9px] uppercase tracking-wider text-ink-2 mb-1">WhatsApp do decisor</span>
                                    {selectedWhatsAppLink ? (
                                        <a href={selectedWhatsAppLink} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline flex items-center gap-1">
                                            <MessageCircle size={12} /> Tentar WhatsApp
                                        </a>
                                    ) : (
                                        <span className="text-ink-2">Não encontrado</span>
                                    )}
                                </div>
                                <div className="rounded-xl bg-surface-2 p-3">
                                    <span className="block text-[9px] uppercase tracking-wider text-ink-2 mb-1">LinkedIn do decisor</span>
                                    <a href={selectedLinkedIn.href} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
                                        <Linkedin size={12} />
                                        {selectedLinkedIn.isDirectProfile ? 'Abrir perfil completo' : 'Localizar perfil no LinkedIn'}
                                    </a>
                                </div>
                            </div>
                            <p className="text-[9px] text-ink-2 mt-2">
                                Perfil montado com os dados retornados por Apollo/Hunter. O LinkedIn não permite incorporar sua página completa com segurança.
                            </p>
                        </div>
                    )}
                    {results.length === 0 ? (
                        <p className="text-sm text-ink-2">Nenhuma pessoa encontrada com estes filtros.</p>
                    ) : (
                        <div className="space-y-2">
                            {results.map((dm, idx) => {
                                const linkedIn = getDecisionMakerLinkedInLink({
                                    name: dm.name,
                                    title: dm.title,
                                    companyName,
                                    linkedinUrl: dm.linkedinUrl,
                                });

                                return (
                                    <div key={idx} className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface border border-line rounded-xl px-3 py-2 text-xs text-ink-2">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDecisionMaker(dm)}
                                            title={`Exibir o perfil consolidado de ${dm.name} dentro da ferramenta`}
                                            className="font-bold text-sm text-ink hover:text-blue-400 hover:underline transition-colors"
                                        >
                                            {dm.name}
                                        </button>
                                        {dm.title && <span className="text-ink-2 font-medium bg-surface-2 px-2 py-0.5 rounded-md">{dm.title}</span>}
                                        {dm.email && (
                                            <a href={`mailto:${dm.email}`} className="flex items-center gap-1 text-success font-medium bg-success/10 px-2 py-0.5 rounded-md hover:underline">
                                                <Mail size={12} /> {dm.email}
                                                {dm.emailSource === 'hunter' && <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full font-bold ml-1">HUNTER</span>}
                                            </a>
                                        )}
                                        {getTelephoneLink(dm.phone) && (
                                            <a href={getTelephoneLink(dm.phone)} className="flex items-center gap-1 text-ink-2 hover:text-ink hover:underline">
                                                <Phone size={12} /> {dm.phone}
                                            </a>
                                        )}
                                        {getWhatsAppLink(dm.phone) && (
                                            <a href={getWhatsAppLink(dm.phone)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline">
                                                <MessageCircle size={12} /> WhatsApp
                                            </a>
                                        )}
                                        <a
                                            href={linkedIn.href}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline"
                                        >
                                            <Linkedin size={12} />
                                            Perfil no LinkedIn (Direto)
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDecisionMaker(dm)}
                                            className="text-indigo-300 hover:text-indigo-200 hover:underline"
                                        >
                                            Ver perfil na ferramenta
                                        </button>

                                        <div className="w-full flex items-center justify-between mt-2 pt-2 border-t border-line">
                                            <button
                                                type="button"
                                                disabled={icebreakers[idx]?.loading}
                                                onClick={(e) => { e.preventDefault(); handleGenerateIcebreaker(idx); }}
                                                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-wait text-white text-[10px] font-bold px-3 py-1 rounded-lg flex items-center gap-1 transition-colors"
                                            >
                                                {icebreakers[idx]?.loading ? 'Gerando...' : '🧊 Gerar Quebra-Gelo (IA)'}
                                            </button>
                                        </div>
                                        {icebreakers[idx]?.text && (
                                            <p className="w-full text-[11px] text-ink-2 bg-surface-2 border border-line rounded-lg px-3 py-2 mt-1">
                                                💡 {icebreakers[idx].text}
                                            </p>
                                        )}
                                        {icebreakers[idx]?.error && (
                                            <p className="w-full text-[11px] text-warn mt-1">{icebreakers[idx].error}</p>
                                        )}
                                    </div>

                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
