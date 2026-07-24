import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lead, Note, LeadStatus, LEAD_STATUS, LeadQualification } from '../../../types';
import { api } from '../../../lib/api';
import { toast } from '../../../lib/toast';
import { PIC_OPTIONS } from '../../prospecting/constants/icp-options';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import {
    IconClose, IconBuilding, IconMapPin, IconPhone, IconMail, IconLinkedin, IconGlobe, IconStar,
    IconSparkle, IconSpinner, IconTrash, IconSend, IconClock, IconUser, IconDocument, IconClipboard,
    IconChevronDown, IconChevronUp, IconSave, IconTarget, IconMessage,
} from '../../../components/icons';
import { TEMPERATURE_META } from '../constants/leadMeta';

const LEAD_STATUSES: LeadStatus[] = [
    'Novo Lead', 'Qualificação', 'Primeiro Contato', 'Diagnóstico',
    'Proposta', 'Negociação', 'Fechado Ganho', 'Fechado Perdido',
];
void ({} as typeof LEAD_STATUS); // mantém o import de tipo referenciado

interface LeadDetailDrawerProps {
    leadId: string;
    onClose: () => void;
    /** Chamado sempre que o lead muda (status, enriquecimento, exclusão) para o board recarregar. */
    onChanged: () => void;
}

export function LeadDetailDrawer({ leadId, onClose, onChanged }: LeadDetailDrawerProps) {
    const [lead, setLead] = useState<Lead | null>(null);
    const [loading, setLoading] = useState(true);
    const [enriching, setEnriching] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [qualOpen, setQualOpen] = useState(false);
    const [qualDraft, setQualDraft] = useState<LeadQualification>({});
    const [savingQual, setSavingQual] = useState(false);

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
            await api.post(`/api/leads/${leadId}/enrich`);
            toast.success('Lead reenriquecido com sucesso!');
            await fetchLead();
            onChanged();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Falha ao enriquecer o lead.');
        } finally {
            setEnriching(false);
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
            await api.post<Note>(`/api/leads/${leadId}/notes`, { content: noteText.trim(), author: 'Equipe Atlas' });
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
    const temperatureMeta = lead?.temperature ? TEMPERATURE_META[lead.temperature as keyof typeof TEMPERATURE_META] : undefined;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-atlas-dark/40 backdrop-blur-[2px]"
                onClick={onClose}
            />

            <motion.div
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 340, damping: 34 }}
                className="relative w-full max-w-xl h-full glass-panel-strong elevation-4 flex flex-col"
            >
                <div className="p-5 border-b border-black/5 flex items-start justify-between gap-4 shrink-0">
                    <div className="min-w-0">
                        <h2 className="font-black text-xl text-atlas-dark truncate flex items-center gap-2">
                            <IconTarget className="w-5 h-5 text-atlas-orange shrink-0" />
                            {company?.tradeName || company?.legalName || 'Lead'}
                        </h2>
                        <p className="text-xs text-atlas-dark/40 mt-0.5 truncate">
                            {lead?.source || 'Origem desconhecida'}
                            {lead?.createdAt && ` · criado em ${new Date(lead.createdAt).toLocaleDateString('pt-BR')}`}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-atlas-dark/35 hover:text-atlas-dark hover:bg-black/5 rounded-lg transition-colors shrink-0">
                        <IconClose className="w-5 h-5" />
                    </button>
                </div>

                {loading || !lead ? (
                    <div className="flex-1 flex items-center justify-center">
                        <IconSpinner className="w-8 h-8 animate-spin text-atlas-orange" />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                        {/* Estágio + score */}
                        <div className="flex flex-wrap items-center gap-3">
                            <select
                                value={lead.status}
                                onChange={(e) => handleStatusChange(e.target.value)}
                                className="p-2.5 bg-black/[0.02] rounded-xl border border-black/5 text-sm font-bold text-atlas-dark outline-none focus:border-atlas-orange/50 focus:ring-2 focus:ring-atlas-orange/15"
                            >
                                {LEAD_STATUSES.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                            {lead.score != null && (
                                <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-bold">
                                    {temperatureMeta && <temperatureMeta.icon className="w-3.5 h-3.5" />}
                                    Fit {lead.score}%
                                </span>
                            )}
                            <Button variant="premium" size="sm" onClick={handleEnrich} disabled={enriching || !lead.companyId}>
                                {enriching ? <IconSpinner className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <IconSparkle className="w-3.5 h-3.5 mr-1.5" />}
                                {enriching ? 'Enriquecendo...' : 'Enriquecer Lead com IA'}
                            </Button>
                        </div>

                        {/* PIC (Perfil de Cliente Ideal) — setado manualmente pelo SDR/AM */}
                        <div>
                            <h3 className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/35 mb-2 flex items-center gap-1.5">
                                <IconTarget className="w-3.5 h-3.5" /> PIC (Playbook de Pré-Vendas)
                            </h3>
                            <div className="flex flex-wrap gap-1.5">
                                {PIC_OPTIONS.map((pic) => (
                                    <button
                                        key={pic.value}
                                        type="button"
                                        title={pic.desc}
                                        onClick={() => handleSetPic(pic.value)}
                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${lead.pic === pic.value ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-black/[0.02] border-black/5 text-atlas-dark/50 hover:border-indigo-300'}`}
                                    >
                                        {pic.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Empresa */}
                        {company && (
                            <section>
                                <h3 className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/35 mb-2 flex items-center gap-1.5">
                                    <IconBuilding className="w-3.5 h-3.5" /> Empresa
                                </h3>
                                <Card variant="glass" className="p-4 space-y-2 text-sm text-atlas-dark/70">
                                    <p className="font-bold text-atlas-dark">{company.legalName}</p>
                                    {company.cnpj && <p className="flex items-center gap-1.5"><IconDocument className="w-3.5 h-3.5 text-atlas-dark/35" /> {company.cnpj}</p>}
                                    {(company.city || company.state) && (
                                        <p className="flex items-center gap-1.5"><IconMapPin className="w-3.5 h-3.5 text-atlas-dark/35" /> {[company.city, company.state].filter(Boolean).join(', ')}</p>
                                    )}
                                    {company.segment && <p className="flex items-center gap-1.5"><IconBuilding className="w-3.5 h-3.5 text-atlas-dark/35" /> {company.segment}</p>}
                                    {company.phones?.[0] && <p className="flex items-center gap-1.5"><IconPhone className="w-3.5 h-3.5 text-atlas-dark/35" /> {company.phones.join(' · ')}</p>}
                                    {company.emails?.[0] && <p className="flex items-center gap-1.5"><IconMail className="w-3.5 h-3.5 text-atlas-dark/35" /> {company.emails[0]}</p>}
                                    {company.website && (
                                        <p className="flex items-center gap-1.5">
                                            <IconGlobe className="w-3.5 h-3.5 text-atlas-dark/35" />
                                            <a href={company.website.split(' ')[0]} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate">{company.website}</a>
                                        </p>
                                    )}
                                    {company.linkedin && (
                                        <p className="flex items-center gap-1.5">
                                            <IconLinkedin className="w-3.5 h-3.5 text-atlas-dark/35" />
                                            <a href={company.linkedin} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">LinkedIn</a>
                                        </p>
                                    )}
                                    {company.googleRating != null && (
                                        <p className="flex items-center gap-1.5">
                                            <IconStar className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                                            {company.googleRating.toFixed(1)} no Google ({company.googleReviewsCount ?? 0} avaliações)
                                        </p>
                                    )}
                                </Card>
                            </section>
                        )}

                        {/* Contato */}
                        {lead.contact && (
                            <section>
                                <h3 className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/35 mb-2 flex items-center gap-1.5">
                                    <IconUser className="w-3.5 h-3.5" /> Contato
                                </h3>
                                <Card variant="glass" className="p-4 space-y-1.5 text-sm text-atlas-dark/70">
                                    <p className="font-bold text-atlas-dark flex items-center gap-1.5"><IconUser className="w-3.5 h-3.5 text-atlas-dark/35" /> {lead.contact.name}</p>
                                    {lead.contact.role && <p className="text-atlas-dark/45 pl-5">{lead.contact.role}</p>}
                                    {lead.contact.email && <p className="flex items-center gap-1.5"><IconMail className="w-3.5 h-3.5 text-atlas-dark/35" /> {lead.contact.email}</p>}
                                    {lead.contact.phone && <p className="flex items-center gap-1.5"><IconPhone className="w-3.5 h-3.5 text-atlas-dark/35" /> {lead.contact.phone}</p>}
                                </Card>
                            </section>
                        )}

                        {/* Observações do enriquecimento */}
                        {company?.observations && (
                            <section>
                                <h3 className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/35 mb-2 flex items-center gap-1.5">
                                    <IconMessage className="w-3.5 h-3.5" /> Resumo do Enriquecimento
                                </h3>
                                <p className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 text-xs text-atlas-dark/60 leading-relaxed">{company.observations}</p>
                            </section>
                        )}

                        {/* Checklist de Qualificação (Playbook Comercial AtlasGR, 4.2) */}
                        <section>
                            <button
                                onClick={() => setQualOpen((v) => !v)}
                                className="w-full flex items-center justify-between text-[10px] tracking-wider font-bold uppercase text-atlas-dark/35 mb-2 hover:text-atlas-orange transition-colors"
                            >
                                <span className="flex items-center gap-1.5"><IconClipboard className="w-3.5 h-3.5" /> Checklist de Qualificação (Playbook)</span>
                                {qualOpen ? <IconChevronUp className="w-3.5 h-3.5" /> : <IconChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            <AnimatePresence initial={false}>
                                {qualOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                                        className="overflow-hidden"
                                    >
                                        <div className="bg-black/[0.02] rounded-xl p-4 space-y-4">
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
                                                <QualSelect label="Conecta com qual solução Atlas?" value={qualDraft.solucaoAtlas} options={['', 'Profile', 'GR', 'Connect', 'Combinação']} onChange={(v) => setQualDraft((d) => ({ ...d, solucaoAtlas: v as LeadQualification['solucaoAtlas'] }))} />
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

                                            <Button variant="default" className="w-full bg-atlas-dark hover:bg-atlas-dark/90" onClick={handleSaveQualification} disabled={savingQual}>
                                                {savingQual ? <IconSpinner className="w-4 h-4 animate-spin mr-2" /> : <IconSave className="w-4 h-4 mr-2" />}
                                                {savingQual ? 'Salvando...' : 'Salvar checklist'}
                                            </Button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </section>

                        {/* Notas */}
                        <section>
                            <h3 className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/35 mb-2 flex items-center gap-1.5">
                                <IconMessage className="w-3.5 h-3.5" /> Notas ({lead.internalNotes?.length || 0})
                            </h3>
                            <div className="flex gap-2 mb-3">
                                <input
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                                    placeholder="Escreva uma nota e pressione Enter..."
                                    className="flex-1 p-2.5 bg-black/[0.02] rounded-xl border border-black/5 text-sm outline-none focus:border-atlas-orange/50 focus:ring-2 focus:ring-atlas-orange/15"
                                />
                                <button
                                    onClick={handleAddNote}
                                    disabled={savingNote || !noteText.trim()}
                                    className="p-2.5 bg-atlas-dark text-white rounded-xl hover:bg-black transition-colors disabled:opacity-50"
                                >
                                    {savingNote ? <IconSpinner className="w-4 h-4 animate-spin" /> : <IconSend className="w-4 h-4" />}
                                </button>
                            </div>
                            <div className="space-y-2">
                                {(lead.internalNotes || []).map((note) => (
                                    <div key={note.id} className="bg-yellow-50/70 border border-yellow-100 rounded-xl p-3 text-sm text-atlas-dark/70">
                                        <p className="whitespace-pre-wrap">{note.content}</p>
                                        <p className="text-[10px] text-atlas-dark/35 mt-1.5">
                                            {note.author} · {new Date(note.createdAt).toLocaleString('pt-BR')}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Timeline */}
                        <section>
                            <h3 className="text-[10px] tracking-wider font-bold uppercase text-atlas-dark/35 mb-2 flex items-center gap-1.5">
                                <IconClock className="w-3.5 h-3.5" /> Histórico ({lead.timeline?.length || 0})
                            </h3>
                            <div className="space-y-0 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-black/10">
                                {(lead.timeline || []).map((event) => (
                                    <div key={event.id} className="relative pl-6 pb-4">
                                        <div className="absolute left-0 top-1 w-[15px] h-[15px] rounded-full bg-white border-2 border-atlas-orange" />
                                        <p className="text-sm text-atlas-dark/70">{event.description}</p>
                                        <p className="text-[10px] text-atlas-dark/35 flex items-center gap-1 mt-0.5">
                                            <IconClock className="w-3 h-3" /> {new Date(event.createdAt).toLocaleString('pt-BR')}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                )}

                {/* Rodapé */}
                <div className="p-4 border-t border-black/5 flex justify-between items-center shrink-0">
                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex items-center gap-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                    >
                        {deleting ? <IconSpinner className="w-4 h-4 animate-spin" /> : <IconTrash className="w-4 h-4" />}
                        Excluir lead
                    </button>
                    <Button variant="secondary" onClick={onClose}>
                        Fechar
                    </Button>
                </div>
            </motion.div>
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
            <span className="block text-[9px] text-atlas-dark/40 mb-0.5">{label}</span>
            <input
                type="text"
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                className="w-full p-1.5 bg-white rounded-lg border border-black/10 text-xs outline-none focus:border-atlas-orange/50"
            />
        </label>
    );
}

function QualSelect({ label, value, options, onChange }: { label: string; value?: string; options: string[]; onChange: (v: string) => void }) {
    return (
        <label className="block">
            <span className="block text-[9px] text-atlas-dark/40 mb-0.5">{label}</span>
            <select
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                className="w-full p-1.5 bg-white rounded-lg border border-black/10 text-xs outline-none focus:border-atlas-orange/50"
            >
                {options.map((o) => <option key={o} value={o}>{o || '—'}</option>)}
            </select>
        </label>
    );
}
