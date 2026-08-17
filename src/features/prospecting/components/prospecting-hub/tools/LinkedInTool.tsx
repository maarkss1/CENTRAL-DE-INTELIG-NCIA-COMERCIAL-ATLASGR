import { useState } from 'react';
import { Building2, CheckCircle2, ExternalLink, Linkedin, Loader2, Search, ShieldCheck, User, Users, Wand2 } from 'lucide-react';
import { api } from '../../../../../lib/api';
import { useBrand } from '../../../../../contexts/BrandContext';
import { ESTADO_OPTIONS, SEGMENTO_OPTIONS, TOTALTRAC_SEGMENTO_OPTIONS } from '../../../../../shared/constants/icp-options';
import { normalizeCompanyDomain } from '../../../utils/domain';
import { getDecisionMakerLinkedInLink } from '../../../utils/linkedin';
import type { DecisionMaker, ProspectCandidate, ProspectCriteria } from '../../../services/prospecting.service';
import { CandidateCard } from '../CandidateCard';
import { NotConfiguredBanner } from './NotConfiguredBanner';
import { getErrorMessage, type PromoteResult } from './shared';

type SubTab = 'empresas' | 'decisores';

export function LinkedInTool({ configured }: { configured: boolean }) {
    const { activeBrand, brandInfo } = useBrand();
    const activeSegments = activeBrand === 'totaltrac' ? TOTALTRAC_SEGMENTO_OPTIONS : SEGMENTO_OPTIONS;
    const [subTab, setSubTab] = useState<SubTab>('empresas');

    // --- Empresas (Apollo Organization Search filtrado por linkedinUrl) ---
    const [companyCriteria, setCompanyCriteria] = useState<ProspectCriteria>({
        segmento: activeSegments[0],
        localizacao: ESTADO_OPTIONS[24],
        estado: ESTADO_OPTIONS[24],
        quantidade: 15,
    });
    const [isSearchingCompanies, setIsSearchingCompanies] = useState(false);
    const [companyError, setCompanyError] = useState<string | null>(null);
    const [companyTotal, setCompanyTotal] = useState<number | null>(null);
    const [companiesWithLinkedin, setCompaniesWithLinkedin] = useState<ProspectCandidate[]>([]);

    // --- Decisores (Apollo/Hunter People Search filtrado por linkedinUrl) ---
    const [domainInput, setDomainInput] = useState('');
    const [cargosInput, setCargosInput] = useState('');
    const [isSearchingPeople, setIsSearchingPeople] = useState(false);
    const [peopleError, setPeopleError] = useState<string | null>(null);
    const [peopleTotal, setPeopleTotal] = useState<number | null>(null);
    const [peopleWithLinkedin, setPeopleWithLinkedin] = useState<DecisionMaker[]>([]);

    // --- Gerador manual (fallback) ---
    const [manualName, setManualName] = useState('');
    const [manualTitle, setManualTitle] = useState('');
    const [manualCompany, setManualCompany] = useState('');
    const [manualKnownUrl, setManualKnownUrl] = useState('');
    const [manualLink, setManualLink] = useState<{ href: string; isDirectProfile: boolean } | null>(null);

    const [promotingKey, setPromotingKey] = useState<string | null>(null);
    const [promoted, setPromoted] = useState<Record<string, PromoteResult>>({});

    const searchCompanies = async () => {
        setIsSearchingCompanies(true);
        setCompanyError(null);
        try {
            const result = await api.post<{ candidates: ProspectCandidate[]; error?: string }>('/api/prospecting/tools/apollo', companyCriteria, { timeoutMs: 30_000 });
            setCompanyTotal(result.candidates.length);
            setCompaniesWithLinkedin(result.candidates.filter((c) => !!c.linkedinUrl));
            if (result.error) setCompanyError(result.error);
        } catch (err) {
            setCompanyError(getErrorMessage(err, 'Falha ao buscar empresas na Apollo'));
        } finally {
            setIsSearchingCompanies(false);
        }
    };

    const searchPeople = async () => {
        const domain = normalizeCompanyDomain(domainInput);
        if (!domain) {
            setPeopleError('Informe um domínio válido da empresa, como empresa.com.br.');
            return;
        }
        setDomainInput(domain);
        setIsSearchingPeople(true);
        setPeopleError(null);
        try {
            const result = await api.post<{ decisionMakers: DecisionMaker[]; error?: string }>('/api/prospecting/decision-makers', {
                domain,
                criteria: cargosInput.trim() ? { cargos: cargosInput.trim() } : {},
            }, { timeoutMs: 30_000 });
            setPeopleTotal(result.decisionMakers.length);
            setPeopleWithLinkedin(result.decisionMakers.filter((dm) => !!dm.linkedinUrl));
            if (result.error) setPeopleError(result.error);
        } catch (err) {
            setPeopleError(getErrorMessage(err, 'Falha ao buscar decisores'));
        } finally {
            setIsSearchingPeople(false);
        }
    };

    const generateManualLink = () => {
        if (!manualName.trim()) return;
        setManualLink(getDecisionMakerLinkedInLink({
            name: manualName,
            title: manualTitle || undefined,
            companyName: manualCompany,
            linkedinUrl: manualKnownUrl || undefined,
        }));
    };

    const promoteCompany = async (candidate: ProspectCandidate, idx: number) => {
        const key = `li-company-${idx}`;
        setPromotingKey(key);
        try {
            const result = await api.post<PromoteResult>('/api/prospecting/promote', {
                tradeName: candidate.tradeName,
                segment: candidate.segment,
                size: candidate.size,
                location: candidate.location,
                source: `${brandInfo.name} — Ferramenta LinkedIn (Empresas via Apollo)`,
                autoEnrich: false,
                linkedin: candidate.linkedinUrl,
                phone: candidate.phone,
                website: candidate.website,
                decisionMakers: candidate.decisionMakers,
            });
            setPromoted((prev) => ({ ...prev, [key]: result }));
        } catch (err) {
            setCompanyError(getErrorMessage(err, 'Falha ao adicionar ao CRM'));
        } finally {
            setPromotingKey(null);
        }
    };

    const promotePerson = async (dm: DecisionMaker, idx: number) => {
        const key = `li-person-${idx}`;
        setPromotingKey(key);
        try {
            const result = await api.post<PromoteResult>('/api/prospecting/promote', {
                tradeName: domainInput,
                source: `${brandInfo.name} — Ferramenta LinkedIn (Decisores via Apollo)`,
                autoEnrich: false,
                website: domainInput,
                decisionMakers: [dm],
                contact: { name: dm.name, role: dm.title || undefined },
            });
            setPromoted((prev) => ({ ...prev, [key]: result }));
        } catch (err) {
            setPeopleError(getErrorMessage(err, 'Falha ao adicionar ao CRM'));
        } finally {
            setPromotingKey(null);
        }
    };

    const promoteManual = async () => {
        if (!manualName.trim()) return;
        const key = 'li-manual';
        setPromotingKey(key);
        try {
            const result = await api.post<PromoteResult>('/api/prospecting/promote', {
                tradeName: manualCompany.trim() || manualName,
                source: `${brandInfo.name} — Ferramenta LinkedIn (link manual)`,
                autoEnrich: false,
                contact: { name: manualName, role: manualTitle || undefined },
            });
            setPromoted((prev) => ({ ...prev, [key]: result }));
        } catch (err) {
            setPeopleError(getErrorMessage(err, 'Falha ao adicionar ao CRM'));
        } finally {
            setPromotingKey(null);
        }
    };

    return (
        <div className="space-y-6">
            {!configured && <NotConfiguredBanner envVar="APOLLO_API_KEY" />}

            <div className="flex gap-2 bg-surface-2 p-1.5 rounded-xl border border-line w-fit">
                <button
                    onClick={() => setSubTab('empresas')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${subTab === 'empresas' ? 'bg-brand text-white shadow-sm' : 'text-ink-2 hover:text-ink'}`}
                >
                    <Building2 size={14} /> Empresas
                </button>
                <button
                    onClick={() => setSubTab('decisores')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${subTab === 'decisores' ? 'bg-brand text-white shadow-sm' : 'text-ink-2 hover:text-ink'}`}
                >
                    <Users size={14} /> Decisores
                </button>
            </div>

            {subTab === 'empresas' && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                    <div className="xl:col-span-4 bg-surface p-6 rounded-2xl border border-line shadow-sm space-y-4">
                        <p className="text-xs text-ink-2">Busca empresas via Apollo e mostra só as que têm página real de LinkedIn confirmada.</p>
                        <div>
                            <label htmlFor="li-segmento" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Segmento (ICP)</label>
                            <input
                                id="li-segmento"
                                type="text"
                                list="li-segmento-suggestions"
                                className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                                value={companyCriteria.segmento}
                                onChange={(e) => setCompanyCriteria({ ...companyCriteria, segmento: e.target.value })}
                            />
                            <datalist id="li-segmento-suggestions">
                                {activeSegments.map((opt) => <option key={opt} value={opt} />)}
                            </datalist>
                        </div>
                        <div>
                            <label htmlFor="li-estado" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Estado</label>
                            <input
                                id="li-estado"
                                type="text"
                                list="li-estado-suggestions"
                                className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                                value={companyCriteria.estado || ''}
                                onChange={(e) => setCompanyCriteria({ ...companyCriteria, estado: e.target.value, localizacao: e.target.value })}
                            />
                            <datalist id="li-estado-suggestions">
                                {ESTADO_OPTIONS.map((uf) => <option key={uf} value={uf} />)}
                            </datalist>
                        </div>
                        <button
                            onClick={searchCompanies}
                            disabled={isSearchingCompanies}
                            className="w-full bg-brand text-white py-3.5 rounded-xl font-bold hover:bg-[#E04B12] disabled:opacity-80 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
                        >
                            {isSearchingCompanies ? (<><Loader2 className="animate-spin" size={18} /> Buscando...</>) : (<><Search size={18} /> Buscar Empresas</>)}
                        </button>
                        {companyError && <p className="text-xs text-danger">{companyError}</p>}
                    </div>

                    <div className="xl:col-span-8 space-y-4">
                        {companyTotal !== null && (
                            <p className="text-xs font-semibold text-ink-2">
                                {companiesWithLinkedin.length} de {companyTotal} empresa{companyTotal === 1 ? '' : 's'} encontrada{companyTotal === 1 ? '' : 's'} têm página confirmada no LinkedIn.
                            </p>
                        )}
                        {companyTotal === null && !isSearchingCompanies && (
                            <div className="bg-surface p-8 rounded-2xl border border-dashed border-line text-center text-ink-2 text-sm">
                                Nenhuma busca feita ainda — os resultados aparecem aqui.
                            </div>
                        )}
                        {companiesWithLinkedin.map((candidate, idx) => {
                            const key = `li-company-${idx}`;
                            return (
                                <CandidateCard
                                    key={key}
                                    candidate={candidate}
                                    onPromote={() => promoteCompany(candidate, idx)}
                                    isPromoting={promotingKey === key}
                                    promoted={!!promoted[key]}
                                    promotedResult={promoted[key]}
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            {subTab === 'decisores' && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                    <div className="xl:col-span-4 bg-surface p-6 rounded-2xl border border-line shadow-sm space-y-4">
                        <p className="text-xs text-ink-2">Busca decisores via Apollo (com fallback Hunter) e mostra só os que têm perfil real de LinkedIn.</p>
                        <div>
                            <label htmlFor="li-domain" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Domínio da empresa</label>
                            <input
                                id="li-domain"
                                type="text"
                                placeholder="empresa.com.br"
                                className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                                value={domainInput}
                                onChange={(e) => setDomainInput(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="li-cargos" className="block text-[10px] tracking-wider font-bold uppercase mb-1.5 text-ink-2">Cargos (opcional, vírgula)</label>
                            <input
                                id="li-cargos"
                                type="text"
                                placeholder="Ex: Diretor de Logística, CEO"
                                className="w-full p-3 bg-surface-2 rounded-xl border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm font-medium text-ink"
                                value={cargosInput}
                                onChange={(e) => setCargosInput(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={searchPeople}
                            disabled={isSearchingPeople}
                            className="w-full bg-brand text-white py-3.5 rounded-xl font-bold hover:bg-[#E04B12] disabled:opacity-80 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
                        >
                            {isSearchingPeople ? (<><Loader2 className="animate-spin" size={18} /> Buscando...</>) : (<><Search size={18} /> Buscar Decisores</>)}
                        </button>
                        {peopleError && <p className="text-xs text-danger">{peopleError}</p>}
                    </div>

                    <div className="xl:col-span-8 space-y-3">
                        {peopleTotal !== null && (
                            <p className="text-xs font-semibold text-ink-2">
                                {peopleWithLinkedin.length} de {peopleTotal} decisor{peopleTotal === 1 ? '' : 'es'} encontrado{peopleTotal === 1 ? '' : 's'} têm perfil confirmado no LinkedIn.
                            </p>
                        )}
                        {peopleTotal === null && !isSearchingPeople && (
                            <div className="bg-surface p-8 rounded-2xl border border-dashed border-line text-center text-ink-2 text-sm">
                                Nenhuma busca feita ainda — os resultados aparecem aqui.
                            </div>
                        )}
                        {peopleWithLinkedin.map((dm, idx) => {
                            const key = `li-person-${idx}`;
                            const isPromoted = !!promoted[key];
                            return (
                                <div key={key} className="bg-surface p-5 rounded-2xl border border-line shadow-sm flex flex-wrap items-center gap-x-4 gap-y-2">
                                    <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center text-brand shrink-0"><User size={16} /></div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm text-ink">{dm.name}</p>
                                        {dm.title && <p className="text-xs text-ink-2">{dm.title}</p>}
                                    </div>
                                    <a href={dm.linkedinUrl!} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                                        <Linkedin size={12} /> Abrir perfil
                                    </a>
                                    <div className="ml-auto">
                                        {isPromoted ? (
                                            <span className="flex items-center gap-1.5 text-success font-bold text-xs"><CheckCircle2 size={14} /> No CRM</span>
                                        ) : (
                                            <button
                                                onClick={() => promotePerson(dm, idx)}
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
            )}

            <div className="bg-surface-2 p-5 rounded-2xl border border-line space-y-3">
                <p className="text-[10px] tracking-wider font-bold uppercase text-ink-2 flex items-center gap-1.5"><Wand2 size={12} /> Gerador manual (quando a Apollo não encontrou o perfil)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input type="text" placeholder="Nome da pessoa" value={manualName} onChange={(e) => setManualName(e.target.value)} className="p-2.5 bg-surface rounded-xl border border-line outline-none focus:border-brand text-sm text-ink" />
                    <input type="text" placeholder="Cargo (opcional)" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} className="p-2.5 bg-surface rounded-xl border border-line outline-none focus:border-brand text-sm text-ink" />
                    <input type="text" placeholder="Empresa" value={manualCompany} onChange={(e) => setManualCompany(e.target.value)} className="p-2.5 bg-surface rounded-xl border border-line outline-none focus:border-brand text-sm text-ink" />
                    <input type="text" placeholder="URL do LinkedIn já conhecida (opcional)" value={manualKnownUrl} onChange={(e) => setManualKnownUrl(e.target.value)} className="p-2.5 bg-surface rounded-xl border border-line outline-none focus:border-brand text-sm text-ink" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button onClick={generateManualLink} disabled={!manualName.trim()} className="bg-surface border border-line text-ink px-4 py-2 rounded-xl font-bold text-xs hover:border-brand/40 disabled:opacity-50 flex items-center gap-2">
                        <Wand2 size={13} /> Gerar link
                    </button>
                    {manualLink && (
                        <>
                            <a href={manualLink.href} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline">
                                <ExternalLink size={12} /> {manualLink.isDirectProfile ? 'Abrir perfil no LinkedIn' : 'Buscar no LinkedIn'}
                            </a>
                            {promoted['li-manual'] ? (
                                <span className="flex items-center gap-1.5 text-success font-bold text-xs"><CheckCircle2 size={14} /> No CRM</span>
                            ) : (
                                <button onClick={promoteManual} disabled={promotingKey === 'li-manual'} className="bg-brand text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-brand-active flex items-center gap-2 disabled:opacity-60">
                                    {promotingKey === 'li-manual' ? <Loader2 className="animate-spin" size={13} /> : <ShieldCheck size={13} />}
                                    Salvar contato no CRM
                                </button>
                            )}
                        </>
                    )}
                </div>
                <p className="text-[10px] text-ink-2">Isto gera um link — não é uma busca automática de dados do LinkedIn (o LinkedIn não oferece essa API publicamente).</p>
            </div>
        </div>
    );
}
