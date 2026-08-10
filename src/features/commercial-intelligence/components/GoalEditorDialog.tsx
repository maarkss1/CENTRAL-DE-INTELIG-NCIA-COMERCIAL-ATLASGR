import { useEffect, useState } from 'react';
import { Dialog } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { commercialIntelligenceApi, type CommercialGoalDTO } from '../commercialIntelligence.api';

interface GoalEditorDialogProps {
    isOpen: boolean;
    onClose: () => void;
    period: string;
    currentGoal: CommercialGoalDTO | null;
    onSaved: (goal: CommercialGoalDTO) => void;
}

/**
 * Meta New MRR (seção 7) — sempre digitada por um Gestor/Admin, nunca inferida (ver AGENTS.md,
 * "Dados reais x demonstração": nenhuma métrica comercial pode ser fabricada). Sem este formulário
 * o cockpit não teria como saber a meta e mostraria "Não disponível" para sempre.
 */
export function GoalEditorDialog({ isOpen, onClose, period, currentGoal, onSaved }: GoalEditorDialogProps) {
    const [amount, setAmount] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setAmount(currentGoal ? String(currentGoal.amount) : '');
            setError(null);
        }
    }, [isOpen, currentGoal]);

    const handleSave = async () => {
        const parsed = Number(amount.replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed < 0) {
            setError('Informe um valor numérico válido (maior ou igual a zero).');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const goal = await commercialIntelligenceApi.setGoal(period, parsed, currentGoal?.currency ?? 'BRL');
            onSaved(goal);
            onClose();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={`Meta New MRR — ${period}`}
            preventClose={saving}
            footer={
                <>
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : 'Salvar meta'}</Button>
                </>
            }
        >
            <div className="space-y-3">
                <label className="block text-sm font-semibold text-ink" htmlFor="goal-amount">
                    Valor da meta (R$)
                </label>
                <input
                    id="goal-amount"
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Ex.: 1000000"
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    autoFocus
                />
                <p className="text-xs text-ink-2">
                    Meta mensal de nova receita recorrente para {period}. Só ADMIN/GESTOR pode alterar.
                </p>
                {error && <p className="text-xs text-[#d03b3b]" role="alert">{error}</p>}
            </div>
        </Dialog>
    );
}
