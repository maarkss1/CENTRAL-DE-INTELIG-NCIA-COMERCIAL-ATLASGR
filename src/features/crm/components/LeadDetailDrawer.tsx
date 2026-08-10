import { useState, useEffect, useCallback, useRef, useId } from 'react';
import {
    X, Building2, MapPin, Phone, Mail, Linkedin, Globe, Star, Sparkles, Loader2,
    Trash, Send, Clock, User, FileText, ClipboardList, ChevronDown, ChevronUp, Save, Link2,
    CheckCircle2, AlertTriangle, Settings2,
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
    const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
    const [savingOwner, setSavingOwner] = useState(false);
    const [bitrixOptionsOpen, setBitrixOptionsOpen] = useState(false);
    const [bitrixConnectionId, setBitrixConnectionId] = useState<string | null>(null);
    const [bitrixStatusOptions, setBitrixStatusOptions] = useState<{ id: string; name: string }[]>([]);
    const [bitrixUserOptions, setBitrixUserOptions] = useState<{ id: string; name: string }[]>([]);
    const [bitrixStatusId, setBitrixStatusId] = useState('');
    const [bitrixAssignedById, setBitrixAssignedById] = useState('');
    const [loadingBitrixOptions, setLoadingBitrixOptions] = useState(false);

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

    // Torna o copiloto de IA global ciente de qual negócio está aberto na tela.
    const { setActiveRecord, clearActiveRecord } = useActiveRecord();
    useEffect(() => {
        if (!lead) return;
        setActiveRecord({
            type: 'lead',
            id: lead.id,
            label: lead.company?.tradeName || lead.contact?.name || 'Negócio sem empresa vinculada',
            summary: [lead.status, lead.temperature ?? undefined].filter(Boolean).join(' — ') || undefined,
        });
        return () => clearActiveRecord(lead.id);
    }, [lead, setActiveRecord, clearActiveRecord]);

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

    // Foco do diálogo modal — mesmo padrão já validado no ToolTechPopover: ao montar (abrir),
    // guarda o elemento que tinha foco e move o foco pro botão Fechar; ao desmontar (fechar),
    // devolve o foco pra ele, se ainda existir no DOM. O drawer só existe montado enquanto está
    // aberto (CrmBoard renderiza condicionalmente por `selectedLeadId`), então mount/unmount aqui
    // corresponde exatamente a abrir/fechar — sem precisar re-registrar nada a cada render.
    useEffect(() => {
        previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
        closeButtonRef.current?.focus();
        return () => {
            previouslyFocusedRef.current?.focus?.();
        };
    }, []);

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
            await api.post('/api/leads/export/bitrix24', {
                leadId,
                connectionId: bitrixConnectionId || undefined,
                statusId: bitrixStatusId || undefined,
                assignedById: bitrixAssignedById || undefined,
            });
            toast.success('Lead exportado para o Bitrix24.');
            // Sem isto, o badge de status de sync (bitrixSyncStatus/bitrixLeadId) ficava desatualizado
            // até o próximo carregamento do drawer — e uma segunda exportação antes do refresh podia
            // ler bitrixLeadId ainda nulo e criar um lead duplicado no Bitrix (ver claimOutboundSync,
            // que hoje evita isso no backend, mas o refetch aqui evita mesmo a tentativa).
            await fetchLead();
            onChanged();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Falha ao exportar para o Bitrix24. Confira a conexão em Integrações.');
        } finally {
            setExportingBitrix(false);
        }
    };

    const loadBitrixOptions = async () => {
        if (bitrixStatusOptions.length > 0 || loadingBitrixOptions) return;
        setLoadingBitrixOptions(true);
        try {
            const connections = await api.get<{ id: string }[]>('/api/bitrix/connections');
            const connectionId = connections[0]?.id;
            if (!connectionId) return;
            setBitrixConnectionId(connectionId);
            const [statuses, users] = await Promise.all([
                api.get<{ id: string; name: string }[]>(`/api/bitrix/lead-statuses?connectionId=${connectionId}`),
                api.get<{ id: string; name: string }[]>(`/api/bitrix/users?connectionId=${connectionId}`),
            ]);
            setBitrixStatusOptions(statuses);
            setBitrixUserOptions(users);
        } catch {
            // Opções avançadas são um complemento — se a busca falhar, o botão "Exportar p/
            // Bitrix24" continua funcionando normalmente sem STATUS_ID/ASSIGNED_BY_ID explícitos.
        } finally {
            setLoadingBitrixOptions(false);
        }
    };

    const toggleBitrixOptions = () => {
        setBitrixOptionsOpen((open) => !open);
        if (!bitrixOptionsOpen) void loadBitrixOptions();
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
            {/* Backdrop — clique fecha por conveniência de mouse/touch; o equivalente de teclado é
                o Escape (handler acima). Mesmo padrão de dismiss por overlay não-focável endossado
                pelas ARIA Authoring Practices pra diálogos, já usado em ToolTechPopover/CrmBoard. */}
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

            {/* Drawer */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative w-full max-w-xl h-full bg-surface shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
            >
                <div className="p-5 border-b border-line flex items-start justify-between gap-4 shrink-0">
                    <div className="min-w-0">
                        <h2 id={titleId} className="font-black text-xl text-ink truncate">
                            🎯 {company?.tradeName || company?.legalName || 'Lead'}
                        </h2>
                        <p className="text-xs text-ink-2 mt-0.5 truncate">
                            {lead?.source || 'Origem desconhecida'}
                            {lead?.createdAt && ` · criado em ${new Date(lead.createdAt).toLocaleDateString('pt-BR')}`}
                        </p>
                    </div>
                    <button
                        ref={closeButtonRef}
                        onClick={onClose}
                        aria-label="Fechar detalhes do lead"
                        className="p-2 text-ink-2 hover:text-ink hover:bg-surface-2 rounded-lg transition-colors shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading || !lead ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-brand" />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                        {/* Estágio + score */}
                        <div className="flex flex-wrap items-center gap-3">
                            <label htmlFor={statusSelectId} className="sr-only">Estágio do lead</label>
                            <select
                                id={statusSelectId}
                                value={lead.status}
                                onChange={(e) => handleStatusChange(e.target.value)}
                                className="p-2.5 bg-surface-2 rounded-xl border border-line text-sm font-bold text-ink outline-none focus:border-brand"
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
                                className="flex items-center gap-1.5 bg-gradient-to-r from-brand to-amber-500 text-white px-4 py-2 rounded-xl font-bold text-xs hover:opacity-90 transition-all disabled:opacity-50"
                            >
                                {enriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                {enriching ? 'Enriquecendo...' : '✨ Enriquecer'}
                            </button>
                        </div>

                        {/* Responsável — realocar para outro vendedor/SDR */}
                        <div>
                            <h3 id={ownerSelectId} className="text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2">👤 Responsável</h3>
                            <div className="flex items-center gap-2">
                                <select
                                    aria-labelledby={ownerSelectId}
                                    value={lead.owner || ''}
                                    onChange={(e) => handleReassignOwner(e.target.value)}
                                    disabled={savingOwner}
                                    className="flex-1 p-2.5 bg-surface-2 rounded-xl border border-line text-sm font-bold text-ink outline-none focus:border-brand disabled:opacity-50"
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
                                        // bg-brand-active (estado ativo) não depende do tema — é
                                        // fundo sólido próprio, texto branco valida AA nas duas
                                        // marcas (5.28:1 AtlasGR / 11.26:1 Total Trac). O hover do
                                        // estado inativo usa dark:hover:border-brand-2/40 pelo
                                        // mesmo motivo do resto do board: --brand cru da Total Trac
                                        // (#374898) quase some sobre superfície escura (2.25:1).
                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${lead.pic === pic.value ? 'bg-brand-active border-brand-active text-white' : 'bg-surface-2 border-line text-ink-2 hover:border-brand/40 dark:hover:border-brand-2/40'}`}
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
                                    <p className="font-bold text-ink">{company.legalName}</p>
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
                                    <p className="font-bold text-ink flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-ink-2" /> {lead.contact.name}</p>
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
                                className="w-full flex items-center justify-between text-[10px] tracking-wider font-bold uppercase text-ink-2 mb-2 hover:text-brand transition-colors"
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
                                    className="flex-1 p-2.5 bg-surface-2 rounded-xl border border-line text-sm outline-none focus:border-brand"
                                />
                                <button
                                    onClick={handleAddNote}
                                    disabled={savingNote || !noteText.trim()}
                                    aria-label="Adicionar nota"
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
                                        <div className="absolute left-0 top-1 w-[15px] h-[15px] rounded-full bg-surface border-2 border-brand" />
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
                <div className="border-t border-line shrink-0">
                    {/* Status de sincronização Bitrix24 — antes desta correção, uma falha no push
                        automático (na criação do lead) só existia no log do servidor, invisível
                        aqui (achado P1-3 da auditoria). bitrixLeadId nulo + status nulo = nunca
                        tentado ainda, então não mostra nada (evita alarmar sobre um lead que
                        simplesmente não foi exportado por escolha). */}
                    {lead?.bitrixSyncStatus && (
                        <div className="px-4 pt-3 flex items-center gap-1.5 text-xs">
                            {lead.bitrixSyncStatus === 'synced' && (
                                <span className="flex items-center gap-1 text-ok font-bold" title={lead.bitrixSyncedAt ? `Sincronizado em ${new Date(lead.bitrixSyncedAt).toLocaleString('pt-BR')}` : undefined}>
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Sincronizado com o Bitrix24
                                </span>
                            )}
                            {lead.bitrixSyncStatus === 'failed' && (
                                <span className="flex items-center gap-1 text-red-600 font-bold" title={lead.bitrixSyncError || undefined}>
                                    <AlertTriangle className="w-3.5 h-3.5" /> Falha ao sincronizar com o Bitrix24{lead.bitrixSyncError ? ` — ${lead.bitrixSyncError}` : ''}
                                </span>
                            )}
                            {lead.bitrixSyncStatus === 'syncing' && (
                                <span className="flex items-center gap-1 text-ink-2 font-bold">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sincronizando com o Bitrix24…
                                </span>
                            )}
                        </div>
                    )}

                    {bitrixOptionsOpen && (
                        <div className="px-4 pt-3 flex flex-wrap items-center gap-2">
                            {loadingBitrixOptions ? (
                                <span className="flex items-center gap-1.5 text-xs text-ink-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando opções do Bitrix24…</span>
                            ) : bitrixStatusOptions.length === 0 && bitrixUserOptions.length === 0 ? (
                                <span className="text-xs text-ink-2">Nenhum portal Bitrix24 conectado — configure em Integrações.</span>
                            ) : (
                                <>
                                    <label className="text-xs">
                                        <span className="sr-only">Status no Bitrix24</span>
                                        <select
                                            value={bitrixStatusId}
                                            onChange={(e) => setBitrixStatusId(e.target.value)}
                                            className="p-2 bg-surface-2 rounded-lg border border-line text-xs font-bold text-ink outline-none focus:border-brand"
                                        >
                                            <option value="">Status padrão do Bitrix24</option>
                                            {bitrixStatusOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </label>
                                    <label className="text-xs">
                                        <span className="sr-only">Responsável no Bitrix24</span>
                                        <select
                                            value={bitrixAssignedById}
                                            onChange={(e) => setBitrixAssignedById(e.target.value)}
                                            className="p-2 bg-surface-2 rounded-lg border border-line text-xs font-bold text-ink outline-none focus:border-brand"
                                        >
                                            <option value="">Sem responsável definido</option>
                                            {bitrixUserOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                        </select>
                                    </label>
                                </>
                            )}
                        </div>
                    )}

                    <div className="p-4 flex justify-between items-center">
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
                            onClick={toggleBitrixOptions}
                            aria-expanded={bitrixOptionsOpen}
                            title="Escolher status e responsável no Bitrix24 antes de exportar"
                            className={`p-2 rounded-xl transition-colors ${bitrixOptionsOpen ? 'bg-surface text-ink' : 'bg-surface-2 text-ink-2 hover:text-ink hover:bg-surface'}`}
                        >
                            <Settings2 className="w-4 h-4" />
                        </button>
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
        </div>
    );
}

function QualGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[9px] tracking-wider font-bold uppercase text-brand mb-1.5">{title}</p>
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
                className="w-full p-1.5 bg-surface rounded-lg border border-line text-xs outline-none focus:border-brand"
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
                className="w-full p-1.5 bg-surface rounded-lg border border-line text-xs outline-none focus:border-brand"
            >
                {options.map((o) => <option key={o} value={o}>{o || '—'}</option>)}
            </select>
        </label>
    );
}
