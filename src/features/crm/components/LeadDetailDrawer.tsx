import { useState, useEffect, useCallback } from 'react';
import {
    X, Building2, MapPin, Phone, Mail, Linkedin, Globe, Star, Sparkles, Loader2,
    Trash, Send, Clock, User, FileText, ClipboardList, ChevronDown, ChevronUp, Save, Link2,
} from 'lucide-react';
import { Lead, Note, LeadStatus, LEAD_STATUS, LeadQualification } from '../../../types';
import { api } from '../../../lib/api';
import { toast } from '../../../lib/toast';
import { PIC_OPTIONS } from '../../../shared/constants/icp-options';
import { AIEmailGenerator } from '../../../components/ui/AIEmailGenerator';
import { useBrand } from '../../../contexts/BrandContext';
import { DecisionMakerSearch } from '../../prospecting/components/ProspectingHub';

const STATUS_EMOJI: Record<string, string> = {
    'Lead Recebido': '🆕', 'Cadência Iniciada': '📣', 'Qualificação (SDR)': '🔎', 'Reunião Agendada': '📅',
    'Lead Desqualificado': '🚫', 'Convertido em Oportunidade': '⭐', 'Nova Oportunidade': '💡',
    'Proposta Enviada': '📄', 'Call/Visita Agendada': '🤝', 'Negócios Perdidos': '❌', 'Negócios Ganhos': '🏆',
};

const TEMPERATURE_EMOJI: Record<string, string> = { Quente: '🔥', Morno: '🌤️', Frio: '❄️' };

const LEAD_STATUSES: LeadStatus[] = [
    'Lead Recebido', 'Cadência Iniciada', 'Qualificação (SDR)', 'Reunião Agendada', 'Lead Desqualificado',
    'Convertido em Oportunidade', 'Nova Oportunidade', 'Proposta Enviada', 'Call/Visita Agendada',
    'Negócios Perdidos', 'Negócios Ganhos'
];
void ({} as typeof LEAD_STATUS); // mantém o import de tipo referenciado

interface LeadDetailDrawerProps {
    leadId: string;
    onClose: () => void;
    /** Chamado sempre que o lead muda (status, enriquecimento, exclusão) para o board recarregar. */
    onChanged: () => void;
}

export function LeadDetailDrawer({ leadId, onClose, onChanged }: LeadDetailDrawerProps) {
    const { activeBrand, brandInfo } = useBrand();
    const [lead, setLead] = useState<Lead | null>(null);
    const [loading, setLoading] = useState(true);
    const [enriching, setEnriching] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [qualOpen, setQualOpen] = useState(false);
    const [qualDraft, setQualDraft] = useState<LeadQualification>({});
    const [savingQual, setSavingQual] = useState(false);
    const [exportingBitrix, setExportingBitrix] = useState(false);
    const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
    const [savingOwner, setSavingOwner] = useState(false);

    const fetchLead = useCallback(async () => {
        try {
            const data = await api.get<Lead>(`/api/leads/${leadId}`);
            setLead(data);
        } catch {
            toast.error('Não foi possível carregar o lead.');
            onClose();
        } finally {
            setLoading(false);
        }
    }, [leadId, onClose]);

    useEffect(() => {
        fetchLead();
    }, [fetchLead]);

    useEffect(() => {
        api.get<{ owners: { id: string; name: string }[] }>('/api/team/assignable')
            .then((data) => setOwners(data.owners))
            .catch(() => setOwners([])); // Sem time cadastrado ainda ou sem permissão — cai pro campo livre.
    }, []);

    useEffect(() => {
        if (lead?.qualification) setQualDraft(lead.qualification);
    }, [lead?.qualification]);

    // Fecha com Esc
    useEffect(() => {
        const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleStatusChange = async (newStatus: string) => {
        try {
            await api.put(`/api/leads/${leadId}`, { status: newStatus });
            toast.success(`Lead movido para "${newStatus}"`);
            await fetchLead();
            onChanged();
        } catch {
            toast.error('Falha ao mudar o estágio do lead.');
        }
    };

    const handleReassignOwner = async (newOwner: string) => {
        if (!lead || newOwner === (lead.owner || '')) return;
        setSavingOwner(true);
        try {
            await api.put(`/api/leads/${leadId}`, { owner: newOwner || null });
            toast.success(newOwner ? `Lead realocado para ${newOwner}.` : 'Responsável removido do lead.');
            await fetchLead();
            onChanged();
        } catch {
            toast.error('Falha ao realocar o lead.');
        } finally {
            setSavingOwner(false);
        }
    };

    const handleSetPic = async (pic: string) => {
        if (!lead) return;
        const nextPic = lead.pic === pic ? null : pic;
        try {
            await api.put(`/api/leads/${leadId}`, { pic: nextPic });
            await fetchLead();
        } catch {
            toast.error('Falha ao definir o PIC.');
        }
    };

    const handleSaveQualification = async () => {
        setSavingQual(true);
        try {
            await api.put(`/api/leads/${leadId}`, { qualification: qualDraft });
            toast.success('Checklist de qualificação salvo.');
            await fetchLead();
        } catch {
            toast.error('Falha ao salvar o checklist.');
        } finally {
            setSavingQual(false);
        }
    };

    const handleEnrich = async () => {
        setEnriching(true);
        try {
            // Enriquecimento encadeia várias chamadas externas (CNPJ, checagem de domínio/e-mail,
            // Google Places, geração de icebreaker por IA) — 15s (timeout padrão do api client)
            // não é suficiente e derrubava a requisição no cliente mesmo quando o backend ia terminar.
            await api.post(`/api/leads/${leadId}/enrich`, undefined, { timeoutMs: 60_000 });
            toast.success('✨ Lead reenriquecido com sucesso!');
            await fetchLead();
            onChanged();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Falha ao enriquecer o lead.');
        } finally {
            setEnriching(false);
        }
    };

    const handleExportBitrix = async () => {
        setExportingBitrix(true);
        try {
            await api.post('/api/leads/export/bitrix24', { leadId });
            toast.success('Lead exportado para o Bitrix24.');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Falha ao exportar para o Bitrix24. Confira a conexão em Integrações.');
        } finally {
            setExportingBitrix(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Tem certeza que deseja excluir este lead? Essa ação não pode ser desfeita.')) return;
        setDeleting(true);
        try {
            await api.delete(`/api/leads/${leadId}`);
            toast.success('Lead excluído.');
            onChanged();
            onClose();
        } catch {
            toast.error('Falha ao excluir o lead.');
            setDeleting(false);
        }
    };

    const handleAddNote = async () => {
        if (!noteText.trim()) return;
        setSavingNote(true);
        try {
            await api.post<Note>(`/api/leads/${leadId}/notes`, { content: noteText.trim(), author: `Equipe ${brandInfo.name}` });
            setNoteText('');
            toast.success('Nota adicionada.');
            await fetchLead();
        } catch {
            toast.error('Falha ao salvar a nota.');
        } finally {
            setSavingNote(false);
        }
    };

    const company = lead?.company;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

            {/* Drawer */}
            <div className="relative w-full max-w-xl h-full bg-surface shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
                <div className="p-5 border-b border-line flex items-start justify-between gap-4 shrink-0">
                    <div className="min-w-0">
                        <h2 className="font-black text-xl text-atlas-dark truncate">
                            🎯 {company?.tradeName || company?.legalName || 'Lead'}
                        </h2>
                        <p className="text-xs text-ink-2 mt-0.5 truncate">
                            {lead?.source || 'Origem desconhecida'}
                            {lead?.createdAt && ` · criado em ${new Date(lead.createdAt).toLocaleDateString('pt-BR')}`}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-ink-2 hover:text-ink hover:bg-surface-2 rounded-lg transition-colors shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading || !lead ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-atlas-orange" />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                        {/* Estágio + score */}
                        <div className="flex flex-wrap items-center gap-3">
                            <select
                                value={lead.status}
                                onChange={(e) => handleStatusChange(e.target.value)}
                                className="p-2.5 bg-surface-2 rounded-xl border border-line text-sm font-bold text-atlas-dark outline-none focus:border-atlas-orange"
                            >
                                {LEAD_STATUSES.map((s) => (
                                    <option key={s} value={s}>{STATUS_EMOJI[s]} {s}</option>
                                ))}
                            </select>
                            {lead.score != null && (
                                <span className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-bold">
                                    {lead.temperature ? `${TEMPERATURE_EMOJI[lead.temperature] || ''} ` : ''}Fit {lead.score}%
                                </span>
                            )}
                            <button
                                onClick={handleEnrich}
                                disabled={enriching || !lead.companyId}
                                className="flex items-center gap-1.5 bg-gradient-to-r from-atlas-orange to-amber-500 text-white px-4 py-2 rounded-xl font-bold text-xs hover:opacity-90 transition-all disabled:opacity-50"
                            >
                                {enriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                {enriching ? 'Enriquecendo...' : '✨ Enriquecer'}
                            </button>
                        </div>

                        {/* Responsável — realocar para outro vendedor/SDR */}
                        <div>
                            <h3 className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2">👤 Responsável</h3>
                            <div className="flex items-center gap-2">
                                <select
                                    value={lead.owner || ''}
                                    onChange={(e) => handleReassignOwner(e.target.value)}
                                    disabled={savingOwner}
                                    className="flex-1 p-2.5 bg-surface-2 rounded-xl border border-line text-sm font-bold text-atlas-dark outline-none focus:border-atlas-orange disabled:opacity-50"
                                >
                                    <option value="">Sem responsável</option>
                                    {owners.map((o) => (
                                        <option key={o.id} value={o.name}>{o.name}</option>
                                    ))}
                                    {/* Garante que um responsável já salvo apareça mesmo se não estiver (mais) na lista da equipe. */}
                                    {lead.owner && !owners.some((o) => o.name === lead.owner) && (
                                        <option value={lead.owner}>{lead.owner}</option>
                                    )}
                                </select>
                                {savingOwner && <Loader2 className="w-4 h-4 animate-spin text-ink-2 shrink-0" />}
                            </div>
                        </div>

                        {/* PIC (Perfil de Cliente Ideal) — setado manualmente pelo SDR/AM */}
                        <div>
                            <h3 className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2">🎯 PIC (Playbook de Pré-Vendas)</h3>
                            <div className="flex flex-wrap gap-1.5">
                                {PIC_OPTIONS.map((pic) => (
                                    <button
                                        key={pic.value}
                                        type="button"
                                        title={pic.desc}
                                        onClick={() => handleSetPic(pic.value)}
                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${lead.pic === pic.value ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-surface-2 border-line text-ink-2 hover:border-indigo-300'}`}
                                    >
                                        {pic.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Empresa */}
                        {company && (
                            <section>
                                <h3 className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2">🏢 Empresa</h3>
                                <div className="bg-surface-2/70 rounded-xl p-4 space-y-2 text-sm text-ink-2">
                                    <p className="font-bold text-atlas-dark">{company.legalName}</p>
                                    {company.cnpj && <p className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-ink-2" /> {company.cnpj}</p>}
                                    {(company.city || company.state) && (
                                        <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-ink-2" /> {[company.city, company.state].filter(Boolean).join(', ')}</p>
                                    )}
                                    {company.segment && <p className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-ink-2" /> {company.segment}</p>}
                                    {company.phones?.[0] && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-ink-2" /> {company.phones.join(' · ')}</p>}
                                    {company.emails?.[0] && <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-ink-2" /> {company.emails[0]}</p>}
                                    {company.website && (
                                        <p className="flex items-center gap-1.5">
                                            <Globe className="w-3.5 h-3.5 text-ink-2" />
                                            <a href={company.website.split(' ')[0]} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate">{company.website}</a>
                                        </p>
                                    )}
                                    {company.linkedin && (
                                        <p className="flex items-center gap-1.5">
                                            <Linkedin className="w-3.5 h-3.5 text-ink-2" />
                                            <a href={company.linkedin} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">LinkedIn</a>
                                        </p>
                                    )}
                                    {company.googleRating != null && (
                                        <p className="flex items-center gap-1.5">
                                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                                            {company.googleRating.toFixed(1)} no Google ({company.googleReviewsCount ?? 0} avaliações)
                                        </p>
                                    )}
                                </div>
                            </section>
                        )}

                        <section>
                            <h3 className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2">👥 Decisores</h3>
                            <DecisionMakerSearch
                                companyName={company?.tradeName || company?.legalName || 'Empresa do lead'}
                                website={company?.website}
                                rationale={company?.observations}
                                companyCnpj={company?.cnpj}
                                companyEmails={company?.emails}
                                companyPhones={company?.phones}
                                appearance="light"
                            />
                        </section>

                        {/* Contato */}
                        {lead.contact && (
                            <section>
                                <h3 className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2">👤 Contato</h3>
                                <div className="bg-surface-2/70 rounded-xl p-4 space-y-1.5 text-sm text-ink-2">
                                    <p className="font-bold text-atlas-dark flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-ink-2" /> {lead.contact.name}</p>
                                    {lead.contact.role && <p className="text-ink-2 pl-5">{lead.contact.role}</p>}
                                    {lead.contact.email && <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-ink-2" /> {lead.contact.email}</p>}
                                    {lead.contact.phone && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-ink-2" /> {lead.contact.phone}</p>}
                                </div>
                            </section>
                        )}

                        {/* Copiloto de IA: e-mail, ligação ou mensagem */}
                        <section>
                            <AIEmailGenerator
                                companyName={company?.legalName || company?.tradeName || 'Empresa Lead'}
                                contactName={lead.contact?.name || 'Decisor de Compras'}
                                sector={company?.segment || 'Mercado B2B'}
                                role={lead.contact?.role || 'Diretor Comercial'}
                                phone={lead.contact?.whatsapp || lead.contact?.phone || company?.phones?.[0]}
                            />
                        </section>

                        {/* Observações do enriquecimento */}
                        {company?.observations && (
                            <section>
                                <h3 className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2">📝 Resumo do Enriquecimento</h3>
                                <p className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-xs text-gray-600 leading-relaxed">{company.observations}</p>
                            </section>
                        )}

                        {/* Checklist de Qualificação (Playbook Comercial AtlasGR, 4.2) */}
                        <section>
                            <button
                                onClick={() => setQualOpen((v) => !v)}
                                className="w-full flex items-center justify-between text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2 hover:text-atlas-orange transition-colors"
                            >
                                <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Checklist de Qualificação (Playbook)</span>
                                {qualOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            {qualOpen && (
                                <div className="bg-surface-2/70 rounded-xl p-4 space-y-4">
                                    <QualGroup title="Contexto Operacional">
                                        <QualInput label="Segmento da operação" value={qualDraft.segmentoOperacao} onChange={(v) => setQualDraft((d) => ({ ...d, segmentoOperacao: v }))} />
                                        <QualInput label="Tipo de carga" value={qualDraft.tipoCarga} onChange={(v) => setQualDraft((d) => ({ ...d, tipoCarga: v }))} />
                                        <QualInput label="Principais rotas" value={qualDraft.principaisRotas} onChange={(v) => setQualDraft((d) => ({ ...d, principaisRotas: v }))} />
                                        <QualSelect label="Usa terceiros?" value={qualDraft.usaTerceiros} options={['', 'Sim', 'Não']} onChange={(v) => setQualDraft((d) => ({ ...d, usaTerceiros: v as LeadQualification['usaTerceiros'] }))} />
                                        <QualInput label="Contratação de terceiros/mês" value={qualDraft.mediaContratacaoTerceiros} onChange={(v) => setQualDraft((d) => ({ ...d, mediaContratacaoTerceiros: v }))} />
                                        <QualInput label="Viagens/mês" value={qualDraft.viagensPorMes} onChange={(v) => setQualDraft((d) => ({ ...d, viagensPorMes: v }))} />
                                        <QualInput label="Frota própria (qtd)" value={qualDraft.frotaPropria} onChange={(v) => setQualDraft((d) => ({ ...d, frotaPropria: v }))} />
                                        <QualInput label="Frota agregados (qtd)" value={qualDraft.frotaAgregados} onChange={(v) => setQualDraft((d) => ({ ...d, frotaAgregados: v }))} />
                                        <QualInput label="Frota terceiros (qtd)" value={qualDraft.frotaTerceiros} onChange={(v) => setQualDraft((d) => ({ ...d, frotaTerceiros: v }))} />
                                    </QualGroup>

                                    <QualGroup title="Estrutura Atual">
                                        <QualInput label="ERP/TMS utilizado" value={qualDraft.ermTms} onChange={(v) => setQualDraft((d) => ({ ...d, ermTms: v }))} />
                                        <QualInput label="Rastreador utilizado" value={qualDraft.rastreador} onChange={(v) => setQualDraft((d) => ({ ...d, rastreador: v }))} />
                                        <QualInput label="Seguradora" value={qualDraft.seguradora} onChange={(v) => setQualDraft((d) => ({ ...d, seguradora: v }))} />
                                        <QualInput label="Corretora" value={qualDraft.corretora} onChange={(v) => setQualDraft((d) => ({ ...d, corretora: v }))} />
                                        <QualInput label="Possui GR hoje? (com quem)" value={qualDraft.possuiGR} onChange={(v) => setQualDraft((d) => ({ ...d, possuiGR: v }))} />
                                        <QualInput label="Cadastro/consulta de motorista (com quem)" value={qualDraft.possuiCadastroMotorista} onChange={(v) => setQualDraft((d) => ({ ...d, possuiCadastroMotorista: v }))} />
                                        <QualInput label="Software logístico (com quem)" value={qualDraft.possuiSoftwareLogistico} onChange={(v) => setQualDraft((d) => ({ ...d, possuiSoftwareLogistico: v }))} />
                                    </QualGroup>

                                    <QualGroup title="Dor Mapeada">
                                        <QualInput label="Dor principal identificada" value={qualDraft.dorPrincipal} onChange={(v) => setQualDraft((d) => ({ ...d, dorPrincipal: v }))} full />
                                        <QualInput label="Detalhamento da dor (exemplo real)" value={qualDraft.detalhamentoDor} onChange={(v) => setQualDraft((d) => ({ ...d, detalhamentoDor: v }))} full />
                                        <QualInput label="Impacto percebido (custo/risco/SLA/retrabalho/margem)" value={qualDraft.impactoPercebido} onChange={(v) => setQualDraft((d) => ({ ...d, impactoPercebido: v }))} full />
                                        <QualSelect
                                            label={`Conecta com qual solução ${brandInfo.name}?`}
                                            value={qualDraft.solucaoAtlas}
                                            options={activeBrand === 'totaltrac' ? ['', 'Telemetria', 'Trava Remota', 'M2M', 'Combinação'] : ['', 'Profile', 'GR', 'Connect', 'Combinação']}
                                            onChange={(v) => setQualDraft((d) => ({ ...d, solucaoAtlas: v as LeadQualification['solucaoAtlas'] }))}
                                        />
                                    </QualGroup>

                                    <QualGroup title="Interesse e Autoridade">
                                        <QualSelect label="Nível de autoridade" value={qualDraft.nivelAutoridade} options={['', 'Decisor', 'Influenciador', 'Usuário']} onChange={(v) => setQualDraft((d) => ({ ...d, nivelAutoridade: v as LeadQualification['nivelAutoridade'] }))} />
                                        <QualSelect label="Interesse percebido" value={qualDraft.interessePercebido} options={['', 'Baixo', 'Médio', 'Alto']} onChange={(v) => setQualDraft((d) => ({ ...d, interessePercebido: v as LeadQualification['interessePercebido'] }))} />
                                        <QualSelect label="Horizonte de decisão" value={qualDraft.horizonteDecisao} options={['', 'Imediato', '30 dias', '60-90 dias', 'Indefinido']} onChange={(v) => setQualDraft((d) => ({ ...d, horizonteDecisao: v as LeadQualification['horizonteDecisao'] }))} />
                                    </QualGroup>

                                    <QualGroup title="Próximo Passo">
                                        <QualInput label="Expectativa do lead para a call" value={qualDraft.expectativaProximaCall} onChange={(v) => setQualDraft((d) => ({ ...d, expectativaProximaCall: v }))} full />
                                        <QualInput label="Tema principal a explorar" value={qualDraft.temaProximaReuniao} onChange={(v) => setQualDraft((d) => ({ ...d, temaProximaReuniao: v }))} full />
                                    </QualGroup>

                                    <button
                                        onClick={handleSaveQualification}
                                        disabled={savingQual}
                                        className="w-full flex items-center justify-center gap-2 bg-atlas-dark text-white py-2.5 rounded-xl font-bold text-sm hover:bg-black transition-colors disabled:opacity-50"
                                    >
                                        {savingQual ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        {savingQual ? 'Salvando...' : 'Salvar checklist'}
                                    </button>
                                </div>
                            )}
                        </section>

                        {/* Notas */}
                        <section>
                            <h3 className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2">💬 Notas ({lead.internalNotes?.length || 0})</h3>
                            <div className="flex gap-2 mb-3">
                                <input
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                                    placeholder="Escreva uma nota e pressione Enter..."
                                    className="flex-1 p-2.5 bg-surface-2 rounded-xl border border-line text-sm outline-none focus:border-atlas-orange"
                                />
                                <button
                                    onClick={handleAddNote}
                                    disabled={savingNote || !noteText.trim()}
                                    className="p-2.5 bg-atlas-dark text-white rounded-xl hover:bg-black transition-colors disabled:opacity-50"
                                >
                                    {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                </button>
                            </div>
                            <div className="space-y-2">
                                {(lead.internalNotes || []).map((note) => (
                                    <div key={note.id} className="bg-yellow-50/70 border border-yellow-100 rounded-xl p-3 text-sm text-gray-700">
                                        <p className="whitespace-pre-wrap">{note.content}</p>
                                        <p className="text-[10px] text-gray-400 mt-1.5">
                                            {note.author} · {new Date(note.createdAt).toLocaleString('pt-BR')}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Timeline */}
                        <section>
                            <h3 className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2">🕐 Histórico ({lead.timeline?.length || 0})</h3>
                            <div className="space-y-0 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-line">
                                {(lead.timeline || []).map((event) => (
                                    <div key={event.id} className="relative pl-6 pb-4">
                                        <div className="absolute left-0 top-1 w-[15px] h-[15px] rounded-full bg-surface border-2 border-atlas-orange" />
                                        <p className="text-sm text-ink-2">{event.description}</p>
                                        <p className="text-[10px] text-ink-2 flex items-center gap-1 mt-0.5">
                                            <Clock className="w-3 h-3" /> {new Date(event.createdAt).toLocaleString('pt-BR')}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                )}

                {/* Rodapé */}
                <div className="p-4 border-t border-line flex justify-between items-center shrink-0">
                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex items-center gap-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                    >
                        {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash className="w-4 h-4" />}
                        Excluir lead
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportBitrix}
                            disabled={exportingBitrix}
                            title="Exportar este lead para o Bitrix24 (requer conexão em Integrações)"
                            className="flex items-center gap-1.5 px-3 py-2 bg-surface-2 text-ink-2 hover:text-ink hover:bg-surface rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                        >
                            {exportingBitrix ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                            Exportar p/ Bitrix24
                        </button>
                        <button onClick={onClose} className="px-4 py-2 bg-surface-2 text-ink-2 rounded-xl text-sm font-bold hover:bg-surface transition-colors">
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function QualGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[9px] tracking-wider font-bold uppercase text-atlas-orange mb-1.5">{title}</p>
            <div className="grid grid-cols-2 gap-2">{children}</div>
        </div>
    );
}

function QualInput({ label, value, onChange, full }: { label: string; value?: string; onChange: (v: string) => void; full?: boolean }) {
    return (
        <label className={`block ${full ? 'col-span-2' : ''}`}>
            <span className="block text-[9px] text-ink-2 mb-0.5">{label}</span>
            <input
                type="text"
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                className="w-full p-1.5 bg-surface rounded-lg border border-line text-xs outline-none focus:border-atlas-orange"
            />
        </label>
    );
}

function QualSelect({ label, value, options, onChange }: { label: string; value?: string; options: string[]; onChange: (v: string) => void }) {
    return (
        <label className="block">
            <span className="block text-[9px] text-ink-2 mb-0.5">{label}</span>
            <select
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                className="w-full p-1.5 bg-surface rounded-lg border border-line text-xs outline-none focus:border-atlas-orange"
            >
                {options.map((o) => <option key={o} value={o}>{o || '—'}</option>)}
            </select>
        </label>
    );
}
