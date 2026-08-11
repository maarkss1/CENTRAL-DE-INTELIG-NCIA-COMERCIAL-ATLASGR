import { useState, useEffect, useCallback, useRef, useId } from 'react';
import {
    X, Building2, MapPin, Phone, Mail, Linkedin, Globe, Star, Sparkles, Loader2,
    Trash, Send, Clock, User, FileText, ClipboardList, ChevronDown, ChevronUp, Save, Link2,
    CheckCircle2, AlertTriangle, Settings2, PhoneCall, MessageCircle,
} from 'lucide-react';
import { Lead, Note, LeadStatus, LeadQualification } from '../../../types';
// LEAD_STATUS é reexportado como tipo em ../../../types (export type {...}) — o array em
// runtime só existe na fonte original.
import { LEAD_STATUS } from '../../../lib/zod';
import { api } from '../../../lib/api';
import { toast } from '../../../lib/toast';
import { PIC_OPTIONS } from '../../../shared/constants/icp-options';
import { AIEmailGenerator } from '../../../components/ui/AIEmailGenerator';
import { useBrand } from '../../../contexts/BrandContext';
import { useActiveRecord } from '../../../contexts/ActiveRecordContext';
import { DecisionMakerSearch } from '../../prospecting/components/ProspectingHub';
// Painel de conversa real (histórico + envio) já usado pela Prospecção sobre a mesma integração
// de WhatsApp (src/features/integrations/whatsapp, sessão Baileys por tenant) — reusado aqui em vez
// de duplicar lógica de polling/envio; CRM só decide QUANDO oferecer a ação, não COMO ela funciona.
import { WhatsAppChatPanel } from '../../integrations/whatsapp/components/WhatsAppChatPanel';

// Mesmo mapa de emoji por status usado em KanbanColumn.tsx (fonte de verdade visual do board) —
// mantido em sincronia manualmente até haver um único lugar para essa constante.
const STATUS_EMOJI: Record<string, string> = {
    'Lead Recebido': '🆕', 'Cadência Iniciada': '📣', 'Qualificação (SDR)': '🔎', 'Reunião Agendada': '📅',
    'Lead Desqualificado': '🚫', 'Convertido em Oportunidade': '⭐', 'Nova Oportunidade': '💡',
    'Proposta Enviada': '📄', 'Call/Visita Agendada': '🤝',
    'Piloto VTECH': '🧪', 'Piloto Atlas Profile': '🧪',
    'Piloto Atlas Profile - Concluído': '✅', 'Piloto Atlas Profile - Cancelado': '⛔',
    'Piloto Logística': '🚚', 'Piloto Logístico - Concluído': '✅', 'Piloto Logístico - Cancelado': '⛔',
    'Negócios Perdidos': '❌', 'Negócios Ganhos': '🏆',
};

const TEMPERATURE_EMOJI: Record<string, string> = { Quente: '🔥', Morno: '🌤️', Frio: '❄️' };

// Lista completa dos 18 estágios (LEAD_STATUS, fonte única em lib/zod.ts) — antes desta correção
// esta lista local parava em 11 e nunca incluía os 7 estágios "Piloto" do funil Negócio, que
// ficavam inalcançáveis por este dropdown mesmo já sendo aceitos pelo backend.
const LEAD_STATUSES: LeadStatus[] = [...LEAD_STATUS];

interface LeadDetailDrawerProps {
    leadId: string;
    onClose: () => void;
    /** Chamado sempre que o lead muda (status, enriquecimento, exclusão) para o board recarregar. */
    onChanged: () => void;
}

export function LeadDetailDrawer({ leadId, onClose, onChanged }: LeadDetailDrawerProps) {
    const { activeBrand, brandInfo } = useBrand();
    const { setActiveLead } = useActiveRecord();
    const titleId = useId();
    const statusSelectId = useId();
    const ownerSelectId = useId();
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);
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
    const [callingVoice, setCallingVoice] = useState(false);
    const [whatsappOpen, setWhatsappOpen] = useState(false);
    const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
    const [savingOwner, setSavingOwner] = useState(false);
    const [bitrixOptionsOpen, setBitrixOptionsOpen] = useState(false);
    const [bitrixConnectionId, setBitrixConnectionId] = useState<string | null>(null);
    const [bitrixStatusOptions, setBitrixStatusOptions] = useState<{ id: string; name: string }[]>([]);
    const [bitrixUserOptions, setBitrixUserOptions] = useState<{ id: string; name: string }[]>([]);
    const [bitrixStatusId, setBitrixStatusId] = useState('');
    const [bitrixAssignedById, setBitrixAssignedById] = useState('');

    const fetchLead = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.get<Lead>(`/api/leads/${leadId}`);
            setLead(data);
            setQualDraft((data.qualification as LeadQualification) || {});
            setActiveLead(data);
        } catch {
            toast.error('Erro ao carregar detalhes do lead');
            onClose();
        } finally {
            setLoading(false);
        }
    }, [leadId, onClose, setActiveLead]);

    useEffect(() => {
        previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
        fetchLead();
        api.get<{ id: string; name: string }[]>('/api/users')
            .then(setOwners)
            .catch(() => setOwners([]));
        api.get<Array<{ id: string; webhookUrl: string }>>('/api/integrations/bitrix24')
            .then((list) => {
                if (list[0]?.id) setBitrixConnectionId(list[0].id);
            })
            .catch(() => setBitrixConnectionId(null));
        return () => {
            setActiveLead(null);
            if (previouslyFocusedRef.current?.focus) {
                previouslyFocusedRef.current.focus();
            }
        };
    }, [fetchLead, setActiveLead]);

    useEffect(() => {
        if (!loading && closeButtonRef.current) {
            closeButtonRef.current.focus();
        }
    }, [loading]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleVoiceCall = useCallback(async () => {
        if (!lead) return;
        setCallingVoice(true);
        try {
            await api.post(`/api/integrations/birth-voice/call/${lead.id}`);
            toast.success('Ligação de qualificação disparada com sucesso! O resultado chega de forma assíncrona.');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Não foi possível disparar a ligação de qualificação.');
        } finally {
            setCallingVoice(false);
        }
    }, [lead]);

    const handleStatusChange = async (newStatus: string) => {
        if (!lead) return;
        try {
            const updated = await api.put<Lead>(`/api/leads/${lead.id}`, { status: newStatus });
            setLead(updated);
            setActiveLead(updated);
            onChanged();
            toast.success(`Status atualizado para "${newStatus}"`);
        } catch {
            toast.error('Erro ao atualizar status');
        }
    };

    const handleOwnerChange = async (newOwnerId: string) => {
        if (!lead) return;
        setSavingOwner(true);
        try {
            const selectedOwner = owners.find((o) => o.id === newOwnerId);
            const ownerName = selectedOwner?.name || newOwnerId;
            const updated = await api.put<Lead>(`/api/leads/${lead.id}`, { owner: ownerName });
            setLead(updated);
            setActiveLead(updated);
            onChanged();
            toast.success('Responsável atualizado com sucesso');
        } catch {
            toast.error('Erro ao atualizar responsável');
        } me: {
            setSavingOwner(false);
        }
    };

    const handleEnrich = async () => {
        if (!lead) return;
        setEnriching(true);
        try {
            const result = await api.post<{ lead: Lead }>(`/api/leads/${lead.id}/enrich`, {});
            setLead(result.lead);
            setActiveLead(result.lead);
            onChanged();
            toast.success('Lead enriquecido com sucesso!');
        } catch {
            toast.error('Erro ao enriquecer lead');
        } finally {
            setEnriching(false);
        }
    };

    const handleAddNote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!noteText.trim() || !lead) return;
        setSavingNote(true);
        try {
            const newNote = await api.post<Note>(`/api/leads/${lead.id}/notes`, { content: noteText.trim() });
            setLead({ ...lead, notes: [newNote, ...(lead.notes || [])] });
            setNoteText('');
            toast.success('Nota adicionada');
        } catch {
            toast.error('Erro ao adicionar nota');
        } finally {
            setSavingNote(false);
        }
    };

    const handleSaveQualification = async () => {
        if (!lead) return;
        setSavingQual(true);
        try {
            const updated = await api.put<Lead>(`/api/leads/${lead.id}`, { qualification: qualDraft });
            setLead(updated);
            setActiveLead(updated);
            setQualOpen(false);
            onChanged();
            toast.success('Qualificação salva com sucesso!');
        } catch {
            toast.error('Erro ao salvar qualificação');
        } finally {
            setSavingQual(false);
        }
    };

    const handleDelete = async () => {
        if (!lead || !window.confirm(`Tem certeza que deseja excluir "${lead.company?.tradeName || lead.contact?.name || 'este lead'}"?`)) return;
        setDeleting(true);
        try {
            await api.delete(`/api/leads/${lead.id}`);
            toast.success('Lead excluído com sucesso');
            onChanged();
            onClose();
        } catch {
            toast.error('Erro ao excluir lead');
        } finally {
            setDeleting(false);
        }
    };

    const openBitrixExportOptions = async () => {
        if (!bitrixConnectionId) {
            toast.error('Nenhuma integração com Bitrix24 configurada.');
            return;
        }
        setBitrixOptionsOpen(true);
        try {
            const [statuses, users] = await Promise.all([
                api.get<Array<{ id: string; name: string }>>(`/api/integrations/bitrix24/${bitrixConnectionId}/statuses`),
                api.get<Array<{ id: string; name: string }>>(`/api/integrations/bitrix24/${bitrixConnectionId}/users`),
            ]);
            setBitrixStatusOptions(statuses);
            setBitrixUserOptions(users);
            if (statuses[0]?.id) setBitrixStatusId(statuses[0].id);
            if (users[0]?.id) setBitrixAssignedById(users[0].id);
        } catch {
            toast.error('Não foi possível carregar as opções do Bitrix24. O export usará os valores padrão.');
        }
    };

    const handleExportToBitrix = async () => {
        if (!lead) return;
        setExportingBitrix(true);
        try {
            const res = await api.post<{ success: boolean; data?: { bitrixDealId: number } }>(
                `/api/leads/${lead.id}/export-bitrix`,
                {
                    statusId: bitrixStatusId || undefined,
                    assignedById: bitrixAssignedById ? parseInt(bitrixAssignedById, 10) : undefined,
                }
            );
            setBitrixOptionsOpen(false);
            if (res.success && res.data?.bitrixDealId) {
                toast.success(`Exportado para o Bitrix24! (ID do Negócio: ${res.data.bitrixDealId})`);
            } else {
                toast.success('Exportado para o Bitrix24!');
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Erro ao exportar para o Bitrix24');
        } finally {
            setExportingBitrix(false);
        }
    };

    const company = lead?.company;
    const leadPhone = lead?.contact?.whatsapp || lead?.contact?.phone || company?.phones?.[0] || null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative w-full max-w-2xl bg-surface border-l border-line shadow-2xl flex flex-col h-full overflow-hidden z-10"
            >
                {loading ? (
                    <div className="flex-1 flex items-center justify-center p-8">
                        <Loader2 className="w-8 h-8 text-brand animate-spin" />
                    </div>
                ) : !lead ? null : (
                    <>
                        <div className="p-6 border-b border-line bg-surface-2/50 shrink-0">
                            <div className="flex items-start justify-between gap-4 mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-brand/10 text-brand flex items-center justify-center shrink-0 border border-brand/20">
                                        <Building2 size={24} />
                                    </div>
                                    <div>
                                        <h2 id={titleId} className="text-xl font-bold text-ink leading-tight">
                                            {company?.tradeName || lead.contact?.name || 'Lead sem nome'}
                                        </h2>
                                        <div className="flex items-center gap-2 mt-1">
                                            {company?.legalName && (
                                                <span className="text-xs text-ink-2 truncate max-w-xs">{company.legalName}</span>
                                            )}
                                            {lead.temperature && (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-line font-medium text-ink">
                                                    {TEMPERATURE_EMOJI[lead.temperature] || ''} {lead.temperature}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleEnrich}
                                        disabled={enriching}
                                        title="Enriquecer dados via IA"
                                        className="p-2 rounded-xl text-ink-2 hover:text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
                                    >
                                        {enriching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                    </button>
                                    <button
                                        onClick={handleDelete}
                                        disabled={deleting}
                                        title="Excluir Lead"
                                        className="p-2 rounded-xl text-ink-2 hover:text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                                    >
                                        {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash className="w-5 h-5" />}
                                    </button>
                                    <button
                                        ref={closeButtonRef}
                                        onClick={onClose}
                                        className="p-2 rounded-xl text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-6">
                                <div>
                                    <label htmlFor={statusSelectId} className="block text-xs font-semibold text-ink-2 mb-1.5">
                                        Status do Funil
                                    </label>
                                    <div className="relative">
                                        <select
                                            id={statusSelectId}
                                            value={lead.status}
                                            onChange={(e) => handleStatusChange(e.target.value)}
                                            className="w-full pl-3 pr-8 py-2 bg-surface border border-line rounded-xl text-sm font-semibold text-ink appearance-none focus:outline-none focus:border-brand"
                                        >
                                            {LEAD_STATUSES.map((st) => (
                                                <option key={st} value={st}>
                                                    {STATUS_EMOJI[st] || '📌'} {st}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-ink-2 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor={ownerSelectId} className="block text-xs font-semibold text-ink-2 mb-1.5">
                                        Responsável
                                    </label>
                                    <div className="relative">
                                        <select
                                            id={ownerSelectId}
                                            value={owners.find((o) => o.name === lead.owner)?.id || lead.owner || ''}
                                            onChange={(e) => handleOwnerChange(e.target.value)}
                                            disabled={savingOwner}
                                            className="w-full pl-3 pr-8 py-2 bg-surface border border-line rounded-xl text-sm font-semibold text-ink appearance-none focus:outline-none focus:border-brand disabled:opacity-50"
                                        >
                                            <option value="">Sem responsável</option>
                                            {owners.map((o) => (
                                                <option key={o.id} value={o.id}>
                                                    {o.name}
                                                </option>
                                            ))}
                                        </select>
                                        {savingOwner ? (
                                            <Loader2 className="w-4 h-4 text-brand animate-spin absolute right-2.5 top-1/2 -translate-y-1/2" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4 text-ink-2 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {company && (
                                <section className="space-y-4">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-brand" /> Dados da Empresa
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4 bg-surface-2/40 p-4 rounded-2xl border border-line">
                                        {company.cnpj && (
                                            <div>
                                                <span className="text-[10px] text-ink-2 font-medium block">CNPJ</span>
                                                <span className="text-xs font-semibold text-ink">{company.cnpj}</span>
                                            </div>
                                        )}
                                        {company.segment && (
                                            <div>
                                                <span className="text-[10px] text-ink-2 font-medium block">Segmento</span>
                                                <span className="text-xs font-semibold text-ink">{company.segment}</span>
                                            </div>
                                        )}
                                        {company.employees && (
                                            <div>
                                                <span className="text-[10px] text-ink-2 font-medium block">Funcionários</span>
                                                <span className="text-xs font-semibold text-ink">{company.employees}</span>
                                            </div>
                                        )}
                                        {company.website && (
                                            <div>
                                                <span className="text-[10px] text-ink-2 font-medium block">Website</span>
                                                <a
                                                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-xs font-semibold text-brand hover:underline flex items-center gap-1"
                                                >
                                                    <Globe className="w-3 h-3" /> {company.website}
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}

                            {lead.contact && (
                                <section className="space-y-4">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-2">
                                        <User className="w-4 h-4 text-brand" /> Contato Principal
                                    </h3>
                                    <div className="bg-surface-2/40 p-4 rounded-2xl border border-line space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-bold text-ink">{lead.contact.name}</span>
                                            {lead.contact.role && (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-line font-medium text-ink-2">
                                                    {lead.contact.role}
                                                </span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-line">
                                            {lead.contact.email && (
                                                <div className="flex items-center gap-2 text-xs text-ink-2">
                                                    <Mail className="w-3.5 h-3.5 text-brand shrink-0" />
                                                    <a href={`mailto:${lead.contact.email}`} className="hover:text-brand truncate">
                                                        {lead.contact.email}
                                                    </a>
                                                </div>
                                            )}
                                            {lead.contact.phone && (
                                                <div className="flex items-center gap-2 text-xs text-ink-2">
                                                    <Phone className="w-3.5 h-3.5 text-brand shrink-0" />
                                                    <a href={`tel:${lead.contact.phone}`} className="hover:text-brand truncate">
                                                        {lead.contact.phone}
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>
                            )}

                            <section className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-2">
                                        <ClipboardList className="w-4 h-4 text-brand" /> Qualificação (ICP)
                                    </h3>
                                    <button
                                        onClick={() => setQualOpen(!qualOpen)}
                                        className="text-xs text-brand hover:underline font-semibold flex items-center gap-1"
                                    >
                                        {qualOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        {qualOpen ? 'Fechar' : 'Editar Qualificação'}
                                    </button>
                                </div>

                                {qualOpen ? (
                                    <div className="bg-surface-2/40 p-4 rounded-2xl border border-line space-y-4">
                                        {PIC_OPTIONS.map((group) => (
                                            <div key={group.category} className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-2 block">
                                                    {group.category}
                                                </label>
                                                <select
                                                    value={qualDraft[group.category as keyof LeadQualification] || ''}
                                                    onChange={(e) => setQualDraft({ ...qualDraft, [group.category]: e.target.value })}
                                                    className="w-full p-2 bg-surface border border-line rounded-xl text-xs font-medium text-ink focus:outline-none focus:border-brand"
                                                >
                                                    <option value="">Selecione...</option>
                                                    {group.options.map((opt) => (
                                                        <option key={opt} value={opt}>
                                                            {opt}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                        <button
                                            onClick={handleSaveQualification}
                                            disabled={savingQual}
                                            className="w-full py-2 bg-brand hover:bg-brand-active text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                                        >
                                            {savingQual ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                            Salvar Qualificação
                                        </button>
                                    </div>
                                ) : (
                                    <div className="bg-surface-2/40 p-4 rounded-2xl border border-line">
                                        {Object.keys(lead.qualification || {}).length === 0 ? (
                                            <p className="text-xs text-ink-2 italic">Nenhuma resposta de qualificação registrada.</p>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-3">
                                                {Object.entries(lead.qualification || {}).map(([k, v]) => (
                                                    <div key={k}>
                                                        <span className="text-[10px] text-ink-2 font-medium block">{k}</span>
                                                        <span className="text-xs font-semibold text-ink">{String(v)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </section>

                            <section className="space-y-4">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-brand" /> Notas & Histórico
                                </h3>
                                <form onSubmit={handleAddNote} className="space-y-2">
                                    <textarea
                                        value={noteText}
                                        onChange={(e) => setNoteText(e.target.value)}
                                        placeholder="Adicionar uma observação..."
                                        rows={3}
                                        className="w-full p-3 bg-surface-2/40 border border-line rounded-2xl text-xs text-ink focus:outline-none focus:border-brand resize-none"
                                    />
                                    <div className="flex justify-end">
                                        <button
                                            type="submit"
                                            disabled={savingNote || !noteText.trim()}
                                            className="px-4 py-2 bg-brand hover:bg-brand-active text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                        >
                                            {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                            Adicionar Nota
                                        </button>
                                    </div>
                                </form>

                                <div className="space-y-3">
                                    {lead.notes?.map((n) => (
                                        <div key={n.id} className="p-3 bg-surface-2/40 rounded-2xl border border-line space-y-1">
                                            <p className="text-xs text-ink whitespace-pre-wrap">{n.content}</p>
                                            <span className="text-[10px] text-ink-2 flex items-center gap-1">
                                                <Clock className="w-3 h-3" /> {new Date(n.createdAt).toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {brandInfo && (
                                <section className="space-y-4">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-brand" /> Copiloto de Vendas ({activeBrand})
                                    </h3>
                                    <AIEmailGenerator lead={lead} />
                                </section>
                            )}
                        </div>

                        <div className="p-4 border-t border-line bg-surface-2/50 shrink-0 flex items-center justify-between">
                            <button
                                onClick={openBitrixExportOptions}
                                disabled={exportingBitrix}
                                className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-sm"
                            >
                                {exportingBitrix ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                                Exportar Bitrix24
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleVoiceCall}
                                    disabled={callingVoice}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-sm"
                                >
                                    {callingVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                                    Qualificar via Voz
                                </button>
                                <button
                                    onClick={() => setWhatsappOpen(true)}
                                    disabled={!leadPhone}
                                    title={leadPhone ? 'Enviar WhatsApp para este lead (sessão da organização)' : 'Este lead não possui telefone cadastrado'}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-sm"
                                >
                                    <MessageCircle className="w-4 h-4" />
                                    WhatsApp
                                </button>
                                <button onClick={onClose} className="px-4 py-2 bg-surface-2 text-ink-2 rounded-xl text-sm font-bold hover:bg-surface transition-colors">
                                    Fechar
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {whatsappOpen && leadPhone && (
                <WhatsAppChatPanel
                    phone={leadPhone}
                    contactName={lead?.contact?.name || company?.tradeName || undefined}
                    onClose={() => setWhatsappOpen(false)}
                />
            )}
        </div>
    );
}
