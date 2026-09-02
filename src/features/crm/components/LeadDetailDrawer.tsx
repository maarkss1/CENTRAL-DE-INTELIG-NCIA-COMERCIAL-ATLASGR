import { useState, useEffect, useCallback, useRef, useId } from 'react';
import {
  X,
  Building2,
  Phone,
  Mail,
  Globe,
  Sparkles,
  Loader2,
  Trash,
  Send,
  Clock,
  User,
  FileText,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Save,
  PhoneCall,
  MessageCircle,
} from 'lucide-react';
import type { Lead, Note, LeadStatus, LeadQualification } from '../../../types';
// LEAD_STATUS é reexportado como tipo em ../../../types (export type {...}) — o array em
// runtime só existe na fonte original.
import { LEAD_STATUS } from '../../../lib/zod';
import { LEAD_STATUS_EMOJI as STATUS_EMOJI } from '../../../lib/enumMap';
import { api } from '../../../lib/api';
import { toast } from '../../../lib/toast';
import { AIEmailGenerator } from '../../../components/ui/AIEmailGenerator';
import { useConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useBrand } from '../../../contexts/BrandContext';
import { useActiveRecord } from '../../../contexts/ActiveRecordContext';
import { useAuth } from '../../../contexts/AuthContext';
// Painel de conversa real (histórico + envio) já usado pela Prospecção sobre a mesma integração
// de WhatsApp (src/features/integrations/whatsapp, sessão Baileys por tenant) — reusado aqui em vez
// de duplicar lógica de polling/envio; CRM só decide QUANDO oferecer a ação, não COMO ela funciona.
import { WhatsAppChatPanel } from '../../integrations/whatsapp/components/WhatsAppChatPanel';

import { bitrixApi } from '../../integrations/bitrix/bitrix.api';
import { calculateLeadScore } from '../domain/leadScoreCalculator';

const TEMPERATURE_EMOJI: Record<string, string> = { Quente: '🔥', Morno: '🌤️', Frio: '❄️' };

const LEAD_STATUSES: LeadStatus[] = [...LEAD_STATUS];

const QUALIFICATION_GROUPS = [
  {
    category: 'budget',
    label: '💰 Budget / Orçamento',
    options: [
      { label: 'Aprovado (Verba garantida para telemetria/rastreamento)', value: 'aprovado' },
      { label: 'Em Planejamento / Estimativa orçamentária', value: 'em_planejamento' },
      { label: 'Indefinido / Avaliando viabilidade', value: 'indefinido' },
      { label: 'Sem Verba / Restrição orçamentária', value: 'sem_verba' },
    ],
  },
  {
    category: 'authority',
    label: '👑 Authority / Nível de Decisão',
    options: [
      { label: 'Decisor C-Level / Sócio / Diretor Executivo', value: 'decisor_clevel' },
      {
        label: 'Influenciador Forte / Gerente de Frota ou Logística',
        value: 'influenciador_gerente',
      },
      { label: 'Usuário Operacional / Supervisor de Pátio', value: 'usuario_operacional' },
      { label: 'Contato inicial / Sem autoridade', value: 'sem_autoridade' },
    ],
  },
  {
    category: 'need',
    label: '🎯 Need / Dores Principais (SPIN)',
    options: [
      {
        label: 'Dor Crítica (Alto custo de Diesel / Sinistros frequentes)',
        value: 'critica_urgente',
      },
      {
        label: 'Otimização Moderada (Controle de jornada e telemetria CAN)',
        value: 'moderada_otimizacao',
      },
      { label: 'Curiosidade / Comparação com concorrentes', value: 'curiosidade_benchmarking' },
      { label: 'Sem Dor identificada no momento', value: 'sem_dor' },
    ],
  },
  {
    category: 'timing',
    label: '⏳ Timing / Prazo de Decisão',
    options: [
      { label: 'Imediato (< 30 dias para início do piloto)', value: 'imediato_30d' },
      { label: 'Curto Prazo (30 a 60 dias)', value: 'curto_60d' },
      { label: 'Médio Prazo (60 a 90 dias)', value: 'medio_90d' },
      { label: 'Longo Prazo (> 90 dias / Indefinido)', value: 'longo_prazo' },
    ],
  },
];

interface LeadDetailDrawerProps {
  leadId: string;
  onClose: () => void;
  /** Chamado sempre que o lead muda (status, enriquecimento, exclusão) para o board recarregar. */
  onChanged: () => void;
}

export function LeadDetailDrawer({ leadId, onClose, onChanged }: LeadDetailDrawerProps) {
  const { activeBrand, brandInfo } = useBrand();
  const { setActiveRecord, clearActiveRecord } = useActiveRecord();
  const { currentUser } = useAuth();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
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
  const [callingVoice, setCallingVoice] = useState(false);
  const [agentType, setAgentType] = useState('sdr');
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [savingOwner, setSavingOwner] = useState(false);
  const [exportingBitrix, setExportingBitrix] = useState(false);

  const handleExportToBitrix = async () => {
    setExportingBitrix(true);
    try {
      const res = await bitrixApi.exportLead(leadId);
      toast.success(`Lead sincronizado com sucesso no Bitrix24 (ID #${res.data.bitrixLeadId})!`);
      fetchLead();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao exportar para Bitrix24');
    } finally {
      setExportingBitrix(false);
    }
  };
  const fetchLead = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<Lead>(`/api/leads/${leadId}`);
      setLead(data);
      setQualDraft((data.qualification as LeadQualification) || {});
      setActiveRecord({
        type: 'lead',
        id: data.id,
        label: data.title || data.company?.legalName || 'Lead',
      });
    } catch {
      toast.error('Erro ao carregar detalhes do lead');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [leadId, onClose, setActiveRecord]);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    fetchLead();
    // /api/users nunca existiu como rota (404 silencioso todo carregamento) — endpoint real é
    // /api/team/assignable (ver team.routes.ts e o mesmo achado em CrmBoard.tsx).
    api
      .get<{ owners: { id: string; name: string }[] }>('/api/team/assignable')
      .then((res) => setOwners(res.owners))
      .catch(() => setOwners([]));
    return () => {
      if (previouslyFocusedRef.current?.focus) {
        previouslyFocusedRef.current.focus();
      }
      clearActiveRecord(leadId);
    };
  }, [fetchLead, leadId, clearActiveRecord]);

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
      await api.post(`/api/integrations/birth-voice/call/${lead.id}`, { agentType });
      toast.success(
        'Ligação de qualificação disparada com sucesso! O resultado chega de forma assíncrona.',
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível disparar a ligação de qualificação.',
      );
    } finally {
      setCallingVoice(false);
    }
  }, [lead, agentType]);

  const handleStatusChange = async (newStatus: string) => {
    if (!lead) return;
    try {
      const updated = await api.put<Lead>(`/api/leads/${lead.id}`, { status: newStatus });
      setLead(updated);
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
      // DATA-003 (Sprint 05/Onda 17): Lead.owner é contrato User.id, não nome — enviar o
      // nome aqui reintroduzia o mesmo bug já corrigido no import Bitrix (onda 10, ver
      // requireLeadOwnership.ts). Todo o resto da aplicação (autoatribuição, round-robin,
      // import Bitrix atual) já grava o id.
      const updated = await api.put<Lead>(`/api/leads/${lead.id}`, { owner: newOwnerId || null });
      setLead(updated);
      onChanged();
      toast.success('Responsável atualizado com sucesso');
    } catch {
      toast.error('Erro ao atualizar responsável');
    } finally {
      setSavingOwner(false);
    }
  };

  const handleEnrich = async () => {
    if (!lead) return;
    setEnriching(true);
    try {
      const result = await api.post<{ lead: Lead }>(`/api/leads/${lead.id}/enrich`, {});
      setLead(result.lead);
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
      const newNote = await api.post<Note>(`/api/leads/${lead.id}/notes`, {
        content: noteText.trim(),
        author: currentUser?.name || 'Usuário',
      });
      setLead((prev) =>
        prev ? { ...prev, internalNotes: [newNote, ...(prev.internalNotes || [])] } : null,
      );
      setNoteText('');
      toast.success('Nota adicionada');
    } catch {
      toast.error('Erro ao adicionar nota');
    } finally {
      setSavingNote(false);
    }
  };

  const liveScore = calculateLeadScore(qualDraft as any);

  const handleSaveQualification = async () => {
    if (!lead) return;
    setSavingQual(true);
    try {
      const updated = await api.put<Lead>(`/api/leads/${lead.id}`, {
        qualification: qualDraft,
        score: liveScore.score,
        temperature: liveScore.temperature,
      });
      setLead(updated);
      setQualOpen(false);
      onChanged();
      toast.success(`Qualificação salva! Score: ${liveScore.score}/100 (${liveScore.temperature})`);
    } catch {
      toast.error('Erro ao salvar qualificação');
    } finally {
      setSavingQual(false);
    }
  };

  const handleDelete = async () => {
    if (!lead) return;
    const confirmed = await confirm({
      title: 'Excluir lead',
      description: `Tem certeza que deseja excluir "${lead.company?.tradeName || lead.contact?.name || 'este lead'}"?`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!confirmed) return;
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

  const company = lead?.company;
  const leadPhone = lead?.contact?.whatsapp || lead?.contact?.phone || company?.phones?.[0] || null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop de "clicar fora fecha" — não precisa de suporte a teclado próprio: Escape já
          fecha o drawer via listener global (window.addEventListener acima), então isto é
          conveniência de mouse/touch, não um alvo de interação que um usuário de teclado precise
          alcançar. aria-hidden="true" (nada semântico aqui) já satisfaz o jsx-a11y sozinho, sem
          precisar de eslint-disable. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
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
                  <div className="w-12 h-12 rounded-2xl bg-brand/10 text-brand-active dark:text-brand-2 flex items-center justify-center shrink-0 border border-brand/20">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <h2 id={titleId} className="text-xl font-bold text-ink leading-tight">
                      {company?.tradeName || lead.contact?.name || 'Lead sem nome'}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      {company?.legalName && (
                        <span className="text-xs text-ink-2 truncate max-w-xs">
                          {company.legalName}
                        </span>
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
                    className="p-2 rounded-xl text-ink-2 hover:text-brand-active dark:hover:text-brand-2 hover:bg-brand/10 transition-colors disabled:opacity-50"
                  >
                    {enriching ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Sparkles className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    title="Excluir Lead"
                    className="p-2 rounded-xl text-ink-2 hover:text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                  >
                    {deleting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Trash className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    ref={closeButtonRef}
                    onClick={onClose}
                    aria-label="Fechar detalhes do lead"
                    title="Fechar detalhes do lead"
                    className="p-2 rounded-xl text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <div>
                  <label
                    htmlFor={statusSelectId}
                    className="block text-xs font-semibold text-ink-2 mb-1.5"
                  >
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
                  <label
                    htmlFor={ownerSelectId}
                    className="block text-xs font-semibold text-ink-2 mb-1.5"
                  >
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
                    {company.employeeCount && company.employeeCount > 0 && (
                      <div>
                        <span className="text-[10px] text-ink-2 font-medium block">
                          Funcionários
                        </span>
                        <span className="text-xs font-semibold text-ink">
                          {company.employeeCount}
                        </span>
                      </div>
                    )}
                    {company.website && (
                      <div>
                        <span className="text-[10px] text-ink-2 font-medium block">Website</span>
                        <a
                          href={
                            company.website.startsWith('http')
                              ? company.website
                              : `https://${company.website}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-brand-active dark:text-brand-2 hover:underline flex items-center gap-1"
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
                          <a
                            href={`mailto:${lead.contact.email}`}
                            className="hover:text-brand truncate"
                          >
                            {lead.contact.email}
                          </a>
                        </div>
                      )}
                      {lead.contact.phone && (
                        <div className="flex items-center gap-2 text-xs text-ink-2">
                          <Phone className="w-3.5 h-3.5 text-brand shrink-0" />
                          <a
                            href={`tel:${lead.contact.phone}`}
                            className="hover:text-brand truncate"
                          >
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
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-brand" /> Matriz BANT & Lead Score
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                        liveScore.temperature === 'Quente'
                          ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                          : liveScore.temperature === 'Morno'
                            ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                            : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                      }`}
                    >
                      {TEMPERATURE_EMOJI[liveScore.temperature]} {liveScore.score}/100
                    </span>
                  </div>
                  <button
                    onClick={() => setQualOpen(!qualOpen)}
                    className="text-xs text-brand-active dark:text-brand-2 hover:underline font-semibold flex items-center gap-1"
                  >
                    {qualOpen ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                    {qualOpen ? 'Fechar' : 'Editar BANT'}
                  </button>
                </div>

                {qualOpen ? (
                  <div className="bg-surface-2/40 p-4 rounded-2xl border border-line space-y-4">
                    {/* Score Meter */}
                    <div className="p-3.5 rounded-xl bg-surface border border-line space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                          🎯 Lead Score:{' '}
                          <b className="text-sm font-black text-brand-active dark:text-brand-2">
                            {liveScore.score}
                          </b>
                          /100
                        </span>
                        <span className="text-xs font-bold text-ink-2">
                          Classificação:{' '}
                          <b className="text-ink">
                            {TEMPERATURE_EMOJI[liveScore.temperature]} {liveScore.temperature}
                          </b>
                        </span>
                      </div>

                      <div className="w-full bg-surface-2 h-2.5 rounded-full overflow-hidden border border-line/50">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            liveScore.score >= 70
                              ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                              : liveScore.score >= 40
                                ? 'bg-gradient-to-r from-blue-500 to-amber-500'
                                : 'bg-blue-500'
                          }`}
                          style={{ width: `${liveScore.score}%` }}
                        />
                      </div>

                      <p className="text-[11px] text-ink-2 italic pt-1">
                        💡 {liveScore.recommendation}
                      </p>
                    </div>

                    {QUALIFICATION_GROUPS.map((group) => (
                      <div key={group.category} className="space-y-1.5">
                        <label
                          htmlFor={`qual-${group.category}`}
                          className="text-[10px] font-bold uppercase tracking-wider text-ink-2 block"
                        >
                          {group.label}
                        </label>
                        <select
                          id={`qual-${group.category}`}
                          value={qualDraft[group.category as keyof LeadQualification] || ''}
                          onChange={(e) =>
                            setQualDraft({ ...qualDraft, [group.category]: e.target.value })
                          }
                          className="w-full p-2 bg-surface border border-line rounded-xl text-xs font-medium text-ink focus:outline-none focus:border-brand"
                        >
                          <option value="">Selecione...</option>
                          {group.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}

                    <button
                      onClick={handleSaveQualification}
                      disabled={savingQual}
                      className="w-full py-2 bg-brand-active hover:brightness-110 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      {savingQual ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      Salvar Matriz & Atualizar Score ({liveScore.score} pts)
                    </button>
                  </div>
                ) : (
                  <div className="bg-surface-2/40 p-4 rounded-2xl border border-line space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-ink">Score Atual:</span>
                        <span className="px-2 py-0.5 rounded-lg bg-surface border border-line font-black text-xs text-brand-active dark:text-brand-2">
                          {lead.score ?? liveScore.score}/100
                        </span>
                      </div>
                      <span className="text-xs font-bold text-ink-2">
                        Temperatura:{' '}
                        <b className="text-ink">
                          {TEMPERATURE_EMOJI[lead.temperature || liveScore.temperature]}{' '}
                          {lead.temperature || liveScore.temperature}
                        </b>
                      </span>
                    </div>

                    {Object.keys(lead.qualification || {}).length === 0 ? (
                      <p className="text-xs text-ink-2 italic">
                        Nenhuma resposta BANT registrada ainda. Clique em &quot;Editar BANT&quot;
                        para qualificar.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line/50">
                        {Object.entries(lead.qualification || {}).map(([k, v]) => (
                          <div key={k} className="p-2 rounded-xl bg-surface border border-line/60">
                            <span className="text-[10px] text-ink-2 uppercase font-bold block">
                              {k}
                            </span>
                            <span className="text-xs font-semibold text-ink capitalize">
                              {String(v).replace(/_/g, ' ')}
                            </span>
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
                      className="px-4 py-2 bg-brand-active hover:brightness-110 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {savingNote ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      Adicionar Nota
                    </button>
                  </div>
                </form>

                <div className="space-y-3">
                  {lead.internalNotes?.map((n) => (
                    <div
                      key={n.id}
                      className="p-3 bg-surface-2/40 rounded-2xl border border-line space-y-1"
                    >
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
                  <AIEmailGenerator
                    companyName={lead.company?.legalName || lead.company?.tradeName || undefined}
                    contactName={lead.contact?.name || undefined}
                    role={lead.contact?.role || undefined}
                    phone={lead.contact?.phone || undefined}
                  />
                </section>
              )}

              {/* Seção de Ação Bitrix24 */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-sky-500" /> Integração Bitrix24
                </h3>
                <div className="bg-surface-2/40 p-4 rounded-2xl border border-line space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] text-ink-2 font-bold uppercase block">
                        Status no Portal
                      </span>
                      {lead.bitrixLeadId || lead.bitrixDealId ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-500/15 border border-sky-500/30 text-sky-700 dark:text-sky-300">
                            🌐 Sincronizado (#{lead.bitrixLeadId || lead.bitrixDealId})
                          </span>
                          {lead.bitrixSyncedAt && (
                            <span className="text-[10px] text-ink-2">
                              · {new Date(lead.bitrixSyncedAt).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium text-ink-2 bg-surface border border-line mt-0.5">
                          Não sincronizado no Bitrix
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleExportToBitrix}
                      disabled={exportingBitrix}
                      className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      {exportingBitrix ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      {lead.bitrixLeadId || lead.bitrixDealId
                        ? 'Reenviar ao Bitrix'
                        : 'Enviar para o Bitrix24'}
                    </button>
                  </div>
                  {lead.bitrixSyncError && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                      ⚠️ Falha na sincronização: {lead.bitrixSyncError}
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="p-4 border-t border-line bg-surface-2/50 shrink-0 flex items-center justify-end">
              <div className="flex items-center gap-2">
                <select
                  value={agentType}
                  onChange={(e) => setAgentType(e.target.value)}
                  className="px-2 py-2 bg-surface border border-line rounded-xl text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="sdr">SDR Frio</option>
                  <option value="reactivation">Reativação</option>
                  <option value="nps">NPS</option>
                </select>
                <button
                  onClick={handleVoiceCall}
                  disabled={callingVoice}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-sm"
                >
                  {callingVoice ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <PhoneCall className="w-4 h-4" />
                  )}
                  Qualificar via Voz
                </button>
                <button
                  onClick={() => setWhatsappOpen(true)}
                  disabled={!leadPhone}
                  title={
                    leadPhone
                      ? 'Enviar WhatsApp para este lead (sessão da organização)'
                      : 'Este lead não possui telefone cadastrado'
                  }
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-sm"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-surface-2 text-ink-2 rounded-xl text-sm font-bold hover:bg-surface transition-colors"
                >
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

      {confirmDialog}
    </div>
  );
}
