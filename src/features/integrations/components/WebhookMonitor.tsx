import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Search,
  AlertTriangle,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Dialog } from '../../../components/ui/Dialog';
import { EmptyState } from '../../../components/ui/EmptyState';
import { api } from '../../../lib/api';

// ── Histórico real de sincronização Bitrix24 ────────────────────────────────────────────────────
//
// Achado real da auditoria (Onda 1 — Fundação, Roadmap v2, Agente 06): esta tela chamava um
// endpoint que nunca existiu no backend (`/api/integrations/webhooks/logs`) e, ao falhar/vir vazio
// (ou seja, SEMPRE, já que a rota nunca existiu), caía silenciosamente para 4 eventos FABRICADOS
// direto no componente — um "webhook Bitrix24" que nunca aconteceu, uma ligação de voz inventada,
// um envio WhatsApp de mentira, uma falha 3CX que nunca ocorreu — com timestamps calculados a
// partir de `Date.now()` para parecerem recentes/reais. Todo usuário que abrisse esta aba via
// telemetria fabricada apresentada como real, sem nenhum aviso. Isso viola diretamente
// `/AGENTS.md` → "Dados reais x demonstração" ("Nenhuma métrica comercial pode ser fabricada para
// 'preencher' a interface") e o bloqueador #11 ("Sincronizações Bitrix que podem falhar
// silenciosamente" — o oposto de mostrar uma falha era fingir sucesso).
//
// Correção: consome `GET /api/bitrix/sync-logs`, que lê `BitrixSyncLog` de verdade (webhook de
// entrada + push/pull automático/manual, já gravados por bitrix.webhook.ts/outboundSync.ts/
// syncRules.ts). WhatsApp/3CX/voz não têm uma tabela de histórico equivalente hoje — em vez de
// inventar uma, o painel é honesto sobre cobrir hoje só a sincronização Bitrix24 real.

type SyncDirection = 'inbound' | 'outbound';
type SyncStatus = 'success' | 'failed' | 'skipped';

interface BitrixSyncLogItem {
  id: string;
  connectionId: string | null;
  direction: SyncDirection;
  entityType: string;
  leadId: string | null;
  bitrixRecordId: string | null;
  status: SyncStatus;
  errorMessage: string | null;
  correlationId: string | null;
  createdAt: string;
}

const ENTITY_LABEL: Record<string, string> = { lead: 'Lead', deal: 'Negócio' };

function statusBadgeVariant(status: SyncStatus): 'success' | 'danger' | 'default' {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'danger';
  return 'default';
}

function statusLabel(status: SyncStatus): string {
  if (status === 'success') return 'SUCESSO';
  if (status === 'failed') return 'FALHOU';
  return 'IGNORADO';
}

export function WebhookMonitor() {
  const [logs, setLogs] = useState<BitrixSyncLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<BitrixSyncLogItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.get<BitrixSyncLogItem[]>('/api/bitrix/sync-logs?take=100');
      setLogs(data);
    } catch (e) {
      // Estado de erro EXPLÍCITO — nunca cai para dado inventado (ver nota de arquitetura no
      // topo do arquivo sobre o achado real desta auditoria).
      setLoadError(
        e instanceof Error ? e.message : 'Não foi possível carregar o histórico de sincronização.',
      );
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const filteredLogs = logs.filter(
    (l) =>
      (ENTITY_LABEL[l.entityType] || l.entityType)
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      l.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.bitrixRecordId || '').toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-brand" />
              Monitor de Sincronização Bitrix24
            </CardTitle>
            <CardDescription>
              Histórico real de webhook de entrada e push/pull Atlas ↔ Bitrix24 — cobre hoje só esta
              integração (WhatsApp, 3CX e voz ainda não têm um histórico equivalente registrado).
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadLogs()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {loadError && (
            <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl border border-danger/30 bg-danger/10 text-xs text-danger-active dark:text-danger">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{loadError}</span>
            </div>
          )}

          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink-2" />
              <input
                type="text"
                aria-label="Filtrar histórico de sincronização"
                placeholder="Filtrar por entidade, status ou ID Bitrix..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-surface-2 border border-line rounded-lg pl-9 pr-3 py-1.5 text-xs text-ink placeholder-ink-2 outline-none focus:border-brand"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-10 text-ink-2 text-xs gap-2 items-center">
              <RefreshCw className="w-4 h-4 animate-spin" /> Carregando histórico...
            </div>
          ) : filteredLogs.length === 0 ? (
            <EmptyState
              icon={<Activity className="w-8 h-8 text-brand" />}
              title={
                logs.length === 0
                  ? 'Nenhuma sincronização registrada ainda'
                  : 'Nenhum resultado para este filtro'
              }
              description={
                logs.length === 0
                  ? 'Assim que o Bitrix24 enviar um evento de webhook, ou o Atlas sincronizar um lead/negócio, o histórico aparece aqui.'
                  : 'Ajuste o termo de busca para ver outros registros.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-ink-2">
                    <th className="py-2.5 px-3 font-semibold">Direção</th>
                    <th className="py-2.5 px-3 font-semibold">Entidade</th>
                    <th className="py-2.5 px-3 font-semibold">ID Bitrix</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Horário</th>
                    <th className="py-2.5 px-3 font-semibold">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-line/50 hover:bg-surface-2/40 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        {log.direction === 'inbound' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                            <ArrowDownLeft className="w-3 h-3" /> Bitrix → Atlas
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                            <ArrowUpRight className="w-3 h-3" /> Atlas → Bitrix
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-ink">
                        {ENTITY_LABEL[log.entityType] || log.entityType}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-ink-2">
                        {log.bitrixRecordId || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant={statusBadgeVariant(log.status)}>
                          {statusLabel(log.status)}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-ink-2 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(log.createdAt).toLocaleString('pt-BR')}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-7 px-2"
                          onClick={() => setSelectedLog(log)}
                        >
                          Inspecionar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Inspeção — primitivo Dialog (<dialog> nativo) em vez de HTML bruto: foco,
          Escape e clique-fora já resolvidos ali, não precisam ser reimplementados aqui
          (achado do Piloto 011). */}
      <Dialog
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Sincronização Bitrix24"
        maxWidth="max-w-xl"
      >
        {selectedLog && (
          <div className="space-y-3 text-xs">
            <p className="text-ink-2">
              {selectedLog.direction === 'inbound' ? 'Bitrix → Atlas' : 'Atlas → Bitrix'} —{' '}
              {ENTITY_LABEL[selectedLog.entityType] || selectedLog.entityType}
              {selectedLog.bitrixRecordId ? ` #${selectedLog.bitrixRecordId}` : ''}
            </p>
            <div className="flex items-center gap-2">
              <Badge variant={statusBadgeVariant(selectedLog.status)}>
                {statusLabel(selectedLog.status)}
              </Badge>
              <span className="text-ink-2">
                {new Date(selectedLog.createdAt).toLocaleString('pt-BR')}
              </span>
            </div>
            {selectedLog.errorMessage && (
              <div className="p-3 rounded-xl border border-danger/30 bg-danger/10 text-danger-active dark:text-danger flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{selectedLog.errorMessage}</span>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-2 text-ink-2">
              <dt className="font-semibold text-ink">Lead local</dt>
              <dd className="font-mono">{selectedLog.leadId || 'não vinculado ainda'}</dd>
              <dt className="font-semibold text-ink">Conexão</dt>
              <dd className="font-mono">{selectedLog.connectionId || '—'}</dd>
              <dt className="font-semibold text-ink">Correlation ID</dt>
              <dd className="font-mono break-all">{selectedLog.correlationId || '—'}</dd>
            </dl>
          </div>
        )}
      </Dialog>
    </div>
  );
}
