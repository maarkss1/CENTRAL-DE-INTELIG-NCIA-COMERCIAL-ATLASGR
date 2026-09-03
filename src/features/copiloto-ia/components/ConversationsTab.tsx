import { useCallback, useEffect, useState } from 'react';
import { Mic, Phone, MessageSquare, FileEdit, HelpCircle, RotateCcw } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Button } from '../../../components/ui/Button';
import {
  copilotoIaApi,
  type CopilotoConversationDTO,
  type CopilotoConversationStatus,
} from '../copilotoIa.api';
import { ConversationDetailDrawer } from './ConversationDetailDrawer';

const STATUS_LABEL: Record<CopilotoConversationStatus, string> = {
  SCHEDULED: 'Agendada',
  CAPTURING: 'Capturando',
  PROCESSING: 'Processando',
  READY: 'Pronta',
  FAILED: 'Falhou',
  CANCELLED: 'Cancelada',
};

const STATUS_VARIANT: Record<
  CopilotoConversationStatus,
  'default' | 'warning' | 'success' | 'danger' | 'outline'
> = {
  SCHEDULED: 'default',
  CAPTURING: 'warning',
  PROCESSING: 'warning',
  READY: 'success',
  FAILED: 'danger',
  CANCELLED: 'outline',
};

const SOURCE_ICON = {
  MEET: Mic,
  CALL: Phone,
  WHATSAPP: MessageSquare,
  MANUAL: FileEdit,
  OTHER: HelpCircle,
} as const;

const SOURCE_LABEL: Record<string, string> = {
  MEET: 'Google Meet',
  CALL: 'Ligação (IA)',
  WHATSAPP: 'WhatsApp',
  MANUAL: 'Manual',
  OTHER: 'Outra',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

interface ConversationsTabProps {
  /** Filtro inicial vindo de `?leadId=` — quando presente, a tela abre já restrita a este Lead
   * (entrada a partir do botão "Ver histórico no Copiloto IA" do LeadDetailDrawer). */
  leadId?: string;
}

export function ConversationsTab({ leadId }: ConversationsTabProps) {
  const [status, setStatus] = useState<CopilotoConversationStatus | ''>('');
  const [conversations, setConversations] = useState<CopilotoConversationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    copilotoIaApi
      .listConversations({ leadId, status: status || undefined })
      .then(setConversations)
      .catch(() => setError('Não foi possível carregar as conversas.'))
      .finally(() => setLoading(false));
  }, [leadId, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="copiloto-status-filter" className="text-sm text-ink-2">
            Status
          </label>
          <select
            id="copiloto-status-filter"
            value={status}
            onChange={(e) => setStatus(e.target.value as CopilotoConversationStatus | '')}
            className="rounded-xl border border-line bg-surface-2/75 px-3 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <option value="">Todos</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {leadId && (
            <Badge variant="info">Filtrado por Lead</Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card padding="lg" className="text-center">
          <p className="text-sm text-danger mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            Tentar de novo
          </Button>
        </Card>
      ) : conversations.length === 0 ? (
        <EmptyState
          title="Nenhuma conversa capturada"
          description={
            leadId
              ? 'Este Lead ainda não tem nenhuma reunião, ligação ou conversa capturada pelo Copiloto.'
              : 'Nenhuma conversa foi capturada ainda pela extensão Chrome ou pela ponte de ligações.'
          }
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 text-xs uppercase tracking-wide text-ink-2">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Origem</th>
                <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                <th className="px-4 py-2.5 text-left font-semibold">Consentimento</th>
                <th className="px-4 py-2.5 text-left font-semibold">Iniciada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {conversations.map((conversation) => {
                const Icon = SOURCE_ICON[conversation.source] ?? HelpCircle;
                return (
                  <tr
                    key={conversation.id}
                    onClick={() => setSelectedId(conversation.id)}
                    className="cursor-pointer transition-colors hover:bg-surface-2/50 focus-visible:bg-surface-2/50"
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedId(conversation.id);
                    }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-ink-2 shrink-0" />
                        <span className="text-ink">
                          {conversation.title || SOURCE_LABEL[conversation.source]}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[conversation.status]}>
                        {STATUS_LABEL[conversation.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          conversation.consentStatus === 'GRANTED'
                            ? 'success'
                            : conversation.consentStatus === 'DECLINED'
                              ? 'danger'
                              : conversation.consentStatus === 'NOT_REQUIRED'
                                ? 'outline'
                                : 'warning'
                        }
                      >
                        {conversation.consentStatus === 'PENDING' && 'Pendente'}
                        {conversation.consentStatus === 'GRANTED' && 'Concedido'}
                        {conversation.consentStatus === 'DECLINED' && 'Recusado'}
                        {conversation.consentStatus === 'NOT_REQUIRED' && 'Dispensado'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {conversation.startedAt
                        ? formatDateTime(conversation.startedAt)
                        : formatDateTime(conversation.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {selectedId && (
        <ConversationDetailDrawer
          conversationId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
