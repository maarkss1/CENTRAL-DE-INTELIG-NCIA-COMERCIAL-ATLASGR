import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { toast } from '../../../lib/toast';
import { LOSS_REASONS } from '../constants/lossReasons';
import {
    mesaTratamentoApi,
    OUTCOME_LABELS,
    isDisqualifyOutcome,
    type QueueLeadDetail,
    type BitrixLeadStageOption,
    type LeadOutcome,
} from '../mesaTratamento.api';

interface CurrentLeadCardProps {
    lead: QueueLeadDetail;
    leadStatuses: BitrixLeadStageOption[];
    onRegistered: () => void;
}

const selectClass =
    'w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand';
const textareaClass = `${selectClass} min-h-[90px] resize-y`;
const labelClass = 'block text-xs font-semibold text-ink-2 mb-1.5';

/** Card do Lead liberado agora + formulário de registro. Só o resultado + observação são
 *  obrigatórios — etapa Bitrix e motivo de desqualificação são condicionais (ver validação no
 *  backend, mesaTratamento.routes.ts). Ver AGENTS.md desta pasta pro que falta (roteiro
 *  sugerido, pontuação, criação de negócio). */
export function CurrentLeadCard({ lead, leadStatuses, onRegistered }: CurrentLeadCardProps) {
    const [outcome, setOutcome] = useState<LeadOutcome | ''>('');
    const [note, setNote] = useState('');
    const [bitrixStatusId, setBitrixStatusId] = useState('');
    const [lossReasonId, setLossReasonId] = useState('');
    const [nextActionTitle, setNextActionTitle] = useState('');
    const [nextActionWhen, setNextActionWhen] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const disqualifying = isDisqualifyOutcome(outcome);

    async function handleSubmit() {
        if (!outcome) return toast.error('Selecione o resultado do contato.');
        if (!note.trim()) return toast.error('Registre uma observação.');
        if (disqualifying && !lossReasonId) return toast.error('Selecione o motivo de desqualificação.');

        setSubmitting(true);
        try {
            await mesaTratamentoApi.register(lead.id, {
                outcome,
                note: note.trim(),
                bitrixStatusId: bitrixStatusId || undefined,
                lossReasonId: disqualifying ? lossReasonId : undefined,
                nextActionTitle: nextActionTitle.trim() || undefined,
                nextActionWhen: nextActionWhen || undefined,
            });
            toast.success('Registrado no Bitrix24. Próximo Lead liberado.');
            setOutcome('');
            setNote('');
            setBitrixStatusId('');
            setLossReasonId('');
            setNextActionTitle('');
            setNextActionWhen('');
            onRegistered();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Não foi possível registrar.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Card accentBar>
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="text-2xl">{lead.title}</CardTitle>
                        <p className="text-sm text-ink-2 mt-1">
                            {lead.segment || 'Segmento não informado'} • {lead.status.replace(/_/g, ' ')}
                        </p>
                    </div>
                    <div className="flex gap-1.5 flex-wrap justify-end">
                        {lead.temperature && <Badge variant="warning">{lead.temperature}</Badge>}
                        {lead.score !== null && <Badge variant="info">Fit Score {lead.score}</Badge>}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <span className="text-ink-2 block text-xs">Contato</span>
                        <span className="text-ink">{lead.contactName || 'Não informado'}{lead.contactRole ? ` • ${lead.contactRole}` : ''}</span>
                    </div>
                    <div>
                        <span className="text-ink-2 block text-xs">Dias sem toque</span>
                        <span className="text-ink">{lead.daysSinceTouch ?? '—'}</span>
                    </div>
                    <div>
                        <span className="text-ink-2 block text-xs">Telefone</span>
                        {lead.phone ? <a href={`tel:${lead.phone}`} className="text-brand hover:underline">{lead.phone}</a> : <span className="text-ink">Não informado</span>}
                    </div>
                    <div>
                        <span className="text-ink-2 block text-xs">E-mail</span>
                        {lead.email ? <a href={`mailto:${lead.email}`} className="text-brand hover:underline">{lead.email}</a> : <span className="text-ink">Não informado</span>}
                    </div>
                </div>

                <div className="border-t border-line pt-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-2">Registrar atendimento</p>

                    <div>
                        <label className={labelClass} htmlFor="mesa-outcome">Resultado *</label>
                        <select id="mesa-outcome" className={selectClass} value={outcome} onChange={(e) => setOutcome(e.target.value as LeadOutcome)}>
                            <option value="">Selecione...</option>
                            {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="mesa-stage">Mover etapa no Bitrix24 (opcional)</label>
                        <select id="mesa-stage" className={selectClass} value={bitrixStatusId} onChange={(e) => setBitrixStatusId(e.target.value)}>
                            <option value="">Não alterar etapa</option>
                            {leadStatuses.map((s) => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                        </select>
                    </div>

                    {disqualifying && (
                        <div>
                            <label className={labelClass} htmlFor="mesa-loss-reason">Motivo de desqualificação * (obrigatório no Bitrix)</label>
                            <select id="mesa-loss-reason" className={selectClass} value={lossReasonId} onChange={(e) => setLossReasonId(e.target.value)}>
                                <option value="">Selecione o motivo...</option>
                                {LOSS_REASONS.map((r) => (
                                    <option key={r.id} value={r.id}>{r.label}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className={labelClass} htmlFor="mesa-note">Observação *</label>
                        <textarea
                            id="mesa-note"
                            className={textareaClass}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Ex.: falou com decisor; pediu retorno segunda; não atendeu; sem aderência porque..."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass} htmlFor="mesa-next-title">Próxima ação (opcional)</label>
                            <input id="mesa-next-title" className={selectClass} value={nextActionTitle} onChange={(e) => setNextActionTitle(e.target.value)} placeholder="Ex.: Retornar proposta" />
                        </div>
                        <div>
                            <label className={labelClass} htmlFor="mesa-next-when">Data/hora</label>
                            <input id="mesa-next-when" type="datetime-local" className={selectClass} value={nextActionWhen} onChange={(e) => setNextActionWhen(e.target.value)} />
                        </div>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                    {submitting ? 'Registrando...' : 'Registrar no Bitrix e liberar próximo'}
                </Button>
            </CardFooter>
        </Card>
    );
}
