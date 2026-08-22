import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Send, CheckCircle2, Sparkles, X } from 'lucide-react';
import { Drawer } from '../../../components/ui/Drawer';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { toast } from '../../../lib/toast';
import { useActiveRecord } from '../../../contexts/ActiveRecordContext';
import {
    commercialIntelligenceApi, formatCurrency,
    type CommercialFilter, type DealDrillDownRow, type ForecastTier,
} from '../commercialIntelligence.api';

export interface DrillDownQuery {
    title: string;
    tier?: ForecastTier;
    stageId?: string;
    agingCritical?: boolean;
    missingNextAction?: boolean;
    /** Restringe a IDs específicos — usado pelo Centro de Decisão/Mentor para abrir exatamente o(s) negócio(s) referenciado(s), não um filtro amplo que poderia trazer outros negócios junto. */
    ids?: string[];
}

interface DealDrillDownDrawerProps {
    filter: CommercialFilter;
    query: DrillDownQuery | null;
    onClose: () => void;
}

const TIER_LABEL: Record<ForecastTier, string> = {
    Commit: 'Commit', BestCase: 'Best Case', Pipeline: 'Pipeline', Upside: 'Upside',
};

function formatDate(iso: string | null): string {
    if (!iso) return 'Não disponível';
    return new Date(iso).toLocaleDateString('pt-BR');
}

/** Drill-down genérico (seção 29) — nenhum KPI/gráfico do módulo deve ficar "morto". */
export function DealDrillDownDrawer({ filter, query, onClose }: DealDrillDownDrawerProps) {
    const [rows, setRows] = useState<DealDrillDownRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notified, setNotified] = useState<Set<string>>(new Set());
    const [composerFor, setComposerFor] = useState<string | null>(null);
    const [draftText, setDraftText] = useState('');
    const [drafting, setDrafting] = useState(false);
    const [sending, setSending] = useState(false);

    const defaultTemplate = (row: DealDrillDownRow) => `⚠️ Risco identificado pelo Comercial Inteligente (AtlasGR Prospector): ${row.riskFactors.join(', ')}.`;

    const openComposer = (row: DealDrillDownRow) => {
        setComposerFor(row.id);
        setDraftText(defaultTemplate(row));
    };

    const closeComposer = () => {
        setComposerFor(null);
        setDraftText('');
    };

    const suggestWithAi = async (row: DealDrillDownRow) => {
        setDrafting(true);
        try {
            const result = await commercialIntelligenceApi.aiBitrixNote(row.id);
            setDraftText(result.draft);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Falha ao gerar sugestão com IA.');
        } finally {
            setDrafting(false);
        }
    };

    const sendToBitrix = async (row: DealDrillDownRow) => {
        if (!draftText.trim()) return;
        setSending(true);
        try {
            await commercialIntelligenceApi.notifyBitrix(row.id, draftText.trim());
            setNotified((prev) => new Set(prev).add(row.id));
            toast.success('Risco registrado na timeline do Bitrix24.');
            closeComposer();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Falha ao notificar o Bitrix24.');
        } finally {
            setSending(false);
        }
    };

    useEffect(() => {
        if (!query) {
            // Fecha o composer ao fechar o drawer inteiro — evita reabrir com estado de uma linha
            // antiga (draft de nota, composer expandido) quando o usuário volta a este drawer.
            setComposerFor(null);
            setDraftText('');
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        commercialIntelligenceApi
            .deals(filter, { tier: query.tier, stageId: query.stageId, agingCritical: query.agingCritical, missingNextAction: query.missingNextAction, ids: query.ids?.join(','), limit: 100 })
            .then((result) => {
                if (cancelled) return;
                setRows(result.rows);
                setTotal(result.total);
            })
            .catch((err) => {
                if (!cancelled) setError((err as Error).message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [filter, query]);

    // Torna o copiloto de IA global ciente do negócio aberto — só faz sentido quando o drill-down
    // resolve para exatamente 1 negócio (aberto via Centro de Decisão/Mentor); uma lista filtrada
    // com vários negócios não tem um "registro aberto" único para registrar.
    const { setActiveRecord, clearActiveRecord } = useActiveRecord();
    useEffect(() => {
        if (rows.length !== 1) return;
        const deal = rows[0];
        setActiveRecord({
            type: 'deal',
            id: deal.id,
            label: deal.title || deal.companyName || 'Negócio sem título',
            summary: [deal.stageName, deal.companyName].filter(Boolean).join(' — ') || undefined,
        });
        return () => clearActiveRecord(deal.id);
    }, [rows, setActiveRecord, clearActiveRecord]);

    return (
        <Drawer isOpen={!!query} onClose={onClose} title={query?.title ?? 'Negócios'} subtitle={total > 0 ? `${total} negócio(s)` : undefined}>
            {loading && (
                <div className="flex items-center justify-center py-12 text-ink-2">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
                </div>
            )}
            {!loading && error && (
                <div className="flex items-center gap-2 text-sm text-critical py-6">
                    <AlertTriangle className="w-4 h-4" /> {error}
                </div>
            )}
            {!loading && !error && rows.length === 0 && (
                <EmptyState title="Nenhum negócio encontrado" description="Não há negócios que atendam a este filtro no momento." />
            )}
            {!loading && !error && rows.length > 0 && (
                <div className="space-y-3">
                    {rows.map((row) => (
                        <div key={row.id} className="rounded-xl border border-line p-3 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <p className="font-bold text-sm text-ink">{row.title || 'Sem título'}</p>
                                    <p className="text-xs text-ink-2">{row.companyName || 'Empresa não informada'}</p>
                                </div>
                                <p className="font-black text-sm text-ink [font-variant-numeric:tabular-nums]">{formatCurrency(row.amount)}</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                                {row.stageName && <Badge variant="outline">{row.stageName}</Badge>}
                                {row.tier && <Badge variant={row.tier === 'Commit' ? 'success' : row.tier === 'Upside' ? 'default' : 'info'}>{TIER_LABEL[row.tier]}</Badge>}
                                {row.agingDays > 45 && <Badge variant="danger">{row.agingDays}d na etapa</Badge>}
                                {!row.nextAction && <Badge variant="warning">Sem próxima ação</Badge>}
                            </div>
                            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-ink-2 pt-1">
                                <div><dt className="inline font-semibold">Responsável: </dt><dd className="inline">{row.owner || 'Não disponível'}</dd></div>
                                <div><dt className="inline font-semibold">Probabilidade: </dt><dd className="inline">{row.weightedProbability != null ? `${row.weightedProbability}%` : 'Não disponível'}</dd></div>
                                <div><dt className="inline font-semibold">Prev. fechamento: </dt><dd className="inline">{formatDate(row.expectedCloseAt)}</dd></div>
                                <div><dt className="inline font-semibold">Última atividade: </dt><dd className="inline">{formatDate(row.lastInteraction)}</dd></div>
                            </dl>
                            {row.riskFactors.length > 0 && (
                                <div className="pt-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-[11px] text-critical">
                                            <span className="font-semibold">Fatores de risco:</span> {row.riskFactors.join(' · ')}
                                        </p>
                                        {row.bitrixLinked && composerFor !== row.id && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className="shrink-0 h-6 px-2 text-[10px]"
                                                disabled={notified.has(row.id)}
                                                onClick={() => openComposer(row)}
                                                title="Registra os fatores de risco na timeline do Bitrix24"
                                            >
                                                {notified.has(row.id) ? <CheckCircle2 className="w-3 h-3" /> : <Send className="w-3 h-3" />}
                                                {notified.has(row.id) ? 'Notificado' : 'Notificar Bitrix'}
                                            </Button>
                                        )}
                                    </div>

                                    {composerFor === row.id && (
                                        <div className="mt-2 rounded-lg border border-line bg-surface-2 p-2 space-y-2">
                                            <label htmlFor={`bitrix-note-${row.id}`} className="sr-only">Nota para o Bitrix24</label>
                                            <textarea
                                                id={`bitrix-note-${row.id}`}
                                                value={draftText}
                                                onChange={(e) => setDraftText(e.target.value)}
                                                rows={3}
                                                className="w-full text-xs rounded-md border border-line bg-surface text-ink p-2 resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                                disabled={drafting || sending}
                                            />
                                            <div className="flex items-center justify-between gap-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    className="h-6 px-2 text-[10px]"
                                                    disabled={drafting || sending}
                                                    onClick={() => suggestWithAi(row)}
                                                    title="Gera a nota com IA a partir dos dados reais deste negócio"
                                                >
                                                    {drafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                                    Sugerir com IA
                                                </Button>
                                                <div className="flex items-center gap-1.5">
                                                    <Button type="button" variant="ghost" className="h-6 px-2 text-[10px]" disabled={drafting || sending} onClick={closeComposer}>
                                                        <X className="w-3 h-3" /> Cancelar
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="h-6 px-2 text-[10px]"
                                                        disabled={drafting || sending || !draftText.trim()}
                                                        onClick={() => sendToBitrix(row)}
                                                    >
                                                        {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                                        Enviar
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Drawer>
    );
}
