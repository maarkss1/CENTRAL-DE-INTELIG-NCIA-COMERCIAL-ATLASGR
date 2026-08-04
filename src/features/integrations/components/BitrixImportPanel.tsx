import { useEffect, useState } from 'react';
import { Loader2, Download, CheckCircle2, RefreshCw } from 'lucide-react';
import { api } from '../../../lib/api';

interface BitrixLeadSummary {
    id: string;
    title: string;
    companyTitle: string | null;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    statusLabel: string;
    sourceId: string | null;
    dateCreate: string | null;
    alreadyImported: boolean;
}

export function BitrixImportPanel() {
    const [leads, setLeads] = useState<BitrixLeadSummary[]>([]);
    const [start, setStart] = useState(0);
    const [next, setNext] = useState<number | null>(null);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

    const load = async (from: number) => {
        setLoading(true);
        setError('');
        try {
            const data = await api.get<{ leads: BitrixLeadSummary[]; next: number | null; total: number }>(`/api/bitrix/leads?start=${from}`);
            setLeads(data.leads);
            setNext(data.next);
            setTotal(data.total);
            setStart(from);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Não foi possível carregar os leads do Bitrix24.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load(0);
    }, []);

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const importSelected = async () => {
        if (selected.size === 0) return;
        setImporting(true);
        setError('');
        setImportResult(null);
        try {
            const result = await api.post<{ imported: number; skipped: number }>('/api/bitrix/leads/import', {
                bitrixLeadIds: Array.from(selected),
            }, { timeoutMs: 60_000 });
            setImportResult(result);
            setSelected(new Set());
            await load(start);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Falha ao importar os leads selecionados.');
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-white/10 space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Importar leads do Bitrix24</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Escolha manualmente o que trazer — nada é importado sozinho. {total > 0 && `${total} leads no portal.`}</p>
                </div>
                <button
                    onClick={() => load(start)}
                    disabled={loading}
                    className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                    title="Recarregar"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            {importResult && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {importResult.imported} lead(s) importado(s){importResult.skipped > 0 ? `, ${importResult.skipped} já existiam` : ''}.
                </p>
            )}

            {loading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : (
                <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-100 dark:border-white/10 divide-y divide-gray-100 dark:divide-white/10">
                    {leads.map((lead) => (
                        <label
                            key={lead.id}
                            className={`flex items-start gap-3 p-3 text-xs cursor-pointer ${lead.alreadyImported ? 'opacity-50' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}
                        >
                            <input
                                type="checkbox"
                                checked={selected.has(lead.id)}
                                disabled={lead.alreadyImported}
                                onChange={() => toggle(lead.id)}
                                className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-gray-900 dark:text-white truncate">{lead.title}</span>
                                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-300 text-[10px] font-bold">{lead.statusLabel}</span>
                                    {lead.alreadyImported && <span className="shrink-0 text-[10px] text-gray-400">já importado</span>}
                                </div>
                                <p className="text-gray-500 dark:text-gray-400 truncate">
                                    {[lead.contactName, lead.phone, lead.email].filter(Boolean).join(' · ') || 'Sem contato/telefone/e-mail'}
                                </p>
                            </div>
                        </label>
                    ))}
                    {leads.length === 0 && <p className="p-4 text-xs text-gray-500 text-center">Nenhum lead encontrado.</p>}
                </div>
            )}

            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => load(Math.max(0, start - 50))}
                        disabled={loading || start === 0}
                        className="text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-30"
                    >
                        ← Anterior
                    </button>
                    <button
                        onClick={() => next != null && load(next)}
                        disabled={loading || next == null}
                        className="text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-30"
                    >
                        Próxima →
                    </button>
                </div>
                <button
                    onClick={importSelected}
                    disabled={importing || selected.size === 0}
                    className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors"
                >
                    {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {importing ? 'Importando...' : `Importar ${selected.size > 0 ? `(${selected.size})` : 'selecionados'}`}
                </button>
            </div>
        </div>
    );
}
