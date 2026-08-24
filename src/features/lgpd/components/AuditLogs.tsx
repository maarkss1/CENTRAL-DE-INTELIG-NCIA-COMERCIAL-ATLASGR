import { useEffect, useState, useCallback } from 'react';
import { Shield, RefreshCw, AlertTriangle, Clock, User, HardDrive, Filter } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { api } from '../../../lib/api';

interface AuditLogItem {
    id: string;
    action: string;
    entity: string;
    entityId?: string | null;
    actorId?: string | null;
    ipAddress?: string | null;
    details?: string | null;
    timestamp: string;
}

export function AuditLogs() {
    const [logs, setLogs] = useState<AuditLogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterAction, setFilterAction] = useState<string>('ALL');

    const loadLogs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res: any = await api.get('/api/lgpd/audit-logs');
            setLogs(res.logs || []);
        } catch (err: any) {
            setError(err.message || 'Erro ao carregar logs de auditoria.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadLogs();
    }, [loadLogs]);

    const getActionBadgeVariant = (action: string) => {
        if (action.includes('DELETE') || action.includes('ANONYMIZE') || action.includes('ERASE')) return 'danger';
        if (action.includes('CREATE') || action.includes('CONNECTED')) return 'success';
        if (action.includes('UPDATE') || action.includes('CHANGE')) return 'warning';
        return 'outline';
    };

    const filteredLogs = logs.filter(log => {
        if (filterAction === 'ALL') return true;
        return log.action === filterAction;
    });

    const uniqueActions = Array.from(new Set(logs.map(l => l.action)));

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-brand" />
                            Auditoria & Governança LGPD
                        </CardTitle>
                        <CardDescription>
                            Registro imutável de eventos sensíveis, acessos e operações no tenant
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => void loadLogs()} disabled={loading}>
                            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                            Atualizar
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-center gap-2 mb-4">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    <div className="flex items-center gap-2 mb-4">
                        <Filter className="w-4 h-4 text-ink-2" />
                        <span className="text-xs text-ink-2 font-medium">Filtrar ação:</span>
                        <select
                            value={filterAction}
                            onChange={(e) => setFilterAction(e.target.value)}
                            className="bg-surface-2 border border-line rounded-lg px-2.5 py-1 text-xs text-ink outline-none"
                        >
                            <option value="ALL">Todas as ações ({logs.length})</option>
                            {uniqueActions.map(act => (
                                <option key={act} value={act}>{act}</option>
                            ))}
                        </select>
                    </div>

                    {loading && logs.length === 0 ? (
                        <div className="text-center py-8 text-xs text-ink-2">
                            Carregando trilha de auditoria...
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="text-center py-8 text-xs text-ink-2 border border-dashed border-line rounded-xl">
                            Nenhum registro de auditoria encontrado.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-line text-ink-2">
                                        <th className="py-2.5 px-3 font-semibold">Data / Hora</th>
                                        <th className="py-2.5 px-3 font-semibold">Ação</th>
                                        <th className="py-2.5 px-3 font-semibold">Entidade</th>
                                        <th className="py-2.5 px-3 font-semibold">Ator / Usuário</th>
                                        <th className="py-2.5 px-3 font-semibold">IP / Detalhes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLogs.map((item) => (
                                        <tr key={item.id} className="border-b border-line/50 hover:bg-surface-2/40 transition-colors">
                                            <td className="py-2.5 px-3 whitespace-nowrap text-ink-2">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5 text-ink-2/60" />
                                                    {new Date(item.timestamp).toLocaleString('pt-BR')}
                                                </div>
                                            </td>
                                            <td className="py-2.5 px-3">
                                                <Badge variant={getActionBadgeVariant(item.action)}>
                                                    {item.action}
                                                </Badge>
                                            </td>
                                            <td className="py-2.5 px-3 font-medium text-ink">
                                                <div className="flex items-center gap-1.5">
                                                    <HardDrive className="w-3.5 h-3.5 text-brand/70" />
                                                    <span>{item.entity}</span>
                                                    {item.entityId && (
                                                        <span className="text-[10px] text-ink-2 font-mono bg-surface-2 px-1.5 py-0.5 rounded">
                                                            {item.entityId.slice(0, 8)}...
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-2.5 px-3 text-ink-2">
                                                <div className="flex items-center gap-1">
                                                    <User className="w-3.5 h-3.5 text-ink-2/60" />
                                                    <span>{item.actorId ? item.actorId.slice(0, 8) : 'Sistema / Job'}</span>
                                                </div>
                                            </td>
                                            <td className="py-2.5 px-3 text-ink-2 font-mono text-[11px] max-w-xs truncate">
                                                {item.ipAddress || item.details || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
