import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CheckCheck,
  Trash2,
  Loader2,
  AlertTriangle,
  Info,
  CircleCheck,
  TriangleAlert,
  CircleX,
  Cpu,
} from 'lucide-react';

import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { useConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { useAuth } from '../../../contexts/AuthContext';
import { hasRequiredRole } from '../../../lib/auth/authorization';
import { toast } from '../../../lib/toast';
import {
  notificationsApi,
  relativeTime,
  type NotificationItem,
  type NotificationKind,
} from '../notifications.api';

/**
 * Cores de status, sempre acompanhadas de ícone e do texto do título — a severidade nunca é
 * comunicada só pela cor. Tons `-300` do Tailwind eram feitos pra fundo escuro e nunca tiveram
 * contraste medido contra `--surface` claro — o design system já resolveu exatamente essa
 * combinação com os tokens semânticos + variante `-active` (achado do Piloto 021).
 */
const KIND_STYLE: Record<NotificationKind, { icon: typeof Info; color: string }> = {
  Info: { icon: Info, color: 'text-info-active dark:text-info' },
  Sucesso: { icon: CircleCheck, color: 'text-success-active dark:text-success' },
  Alerta: { icon: TriangleAlert, color: 'text-warning-active dark:text-warning' },
  Erro: { icon: CircleX, color: 'text-danger-active dark:text-danger' },
};

export function Notifications() {
  const accent = useBrandAccent();
  const { currentUser } = useAuth();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  // DELETE de uma notificação broadcast (userId: null, "para toda a organização") agora exige
  // ADMIN/GESTOR no backend — antes qualquer usuário podia apagar um alerta de equipe antes dos
  // outros verem (achado real do Piloto 021, não um desalinhamento de UI vs backend comum: a
  // regra em si não existia até este piloto).
  const canManageBroadcast =
    !!currentUser && hasRequiredRole(currentUser.role, ['ADMIN', 'GESTOR']);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (unreadOnly: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await notificationsApi.list(unreadOnly);
      setItems(data.items);
      setUnread(data.unread);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(onlyUnread);
  }, [load, onlyUnread]);

  const markRead = useCallback(
    async (item: NotificationItem) => {
      if (item.readAt) return;
      const anterior = items;
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnread((u) => Math.max(0, u - 1));
      try {
        await notificationsApi.markRead(item.id);
      } catch (err) {
        setItems(anterior);
        setUnread((u) => u + 1);
        toast.error((err as Error).message);
      }
    },
    [items],
  );

  const markAllRead = useCallback(async () => {
    try {
      const { count } = await notificationsApi.markAllRead();
      toast.success(
        count === 0 ? 'Nada pendente.' : `${count} notificação(ões) marcada(s) como lida(s).`,
      );
      await load(onlyUnread);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [load, onlyUnread]);

  const remove = useCallback(
    async (item: NotificationItem) => {
      // Excluir é irreversível (diferente de marcar como lida) — nenhum outro achado deste piloto
      // mudou isso, mas o próprio módulo nunca teve confirmação nenhuma antes de apagar, ao
      // contrário do restante do app (achado do Piloto 021).
      const confirmed = await confirm({
        title: 'Excluir notificação',
        description: `Excluir a notificação "${item.title}"?`,
        confirmLabel: 'Excluir',
        variant: 'danger',
      });
      if (!confirmed) return;
      setBusyId(item.id);
      try {
        await notificationsApi.remove(item.id);
        setItems((prev) => prev.filter((n) => n.id !== item.id));
        if (!item.readAt) setUnread((u) => Math.max(0, u - 1));
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [confirm],
  );

  return (
    <div className="flex-1 overflow-y-auto bg-transparent p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 border-b border-line pb-6">
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${accent.bgSoft} ${accent.text}`}
            >
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-ink">Notificações</h1>
              <p className="text-sm text-ink-2">
                {loading
                  ? 'Carregando…'
                  : unread === 0
                    ? 'Tudo em dia'
                    : `${unread} não lida${unread === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-line overflow-hidden">
              {[
                { label: 'Todas', value: false },
                { label: 'Não lidas', value: true },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setOnlyUnread(opt.value)}
                  aria-pressed={onlyUnread === opt.value}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    onlyUnread === opt.value
                      ? `${accent.bg} text-white`
                      : 'text-ink-2 hover:text-ink hover:bg-surface-2'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void markAllRead()}
              disabled={loading || unread === 0}
            >
              <CheckCheck className="w-4 h-4 mr-2" /> Marcar todas
            </Button>
          </div>
        </div>

        {loading && (
          <Card padding="lg" className="text-center text-ink-2 text-sm">
            <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> Carregando…
          </Card>
        )}

        {error && !loading && (
          <Card padding="lg" className="text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-danger-active dark:text-danger" />
            <p className="text-sm text-ink-2 mb-4">{error}</p>
            <Button type="button" variant="outline" onClick={() => void load(onlyUnread)}>
              Tentar novamente
            </Button>
          </Card>
        )}

        {!loading && !error && items.length === 0 && (
          <Card padding="lg" className="text-center border-dashed">
            <Bell className="w-12 h-12 mx-auto mb-4 text-ink-2" />
            <h3 className="text-lg font-semibold text-ink mb-1">
              {onlyUnread ? 'Nenhuma notificação não lida' : 'Nenhuma notificação ainda'}
            </h3>
            <p className="text-sm text-ink-2 max-w-md mx-auto">
              Crie automações para ser avisado quando um lead mudar de etapa ou uma atividade for
              concluída.
            </p>
          </Card>
        )}

        <div className="space-y-2">
          {items.map((item) => {
            const { icon: Icon, color } = KIND_STYLE[item.kind] ?? KIND_STYLE.Info;
            const lida = item.readAt != null;
            const isBroadcast = item.userId == null;
            const canDelete = !isBroadcast || canManageBroadcast;
            return (
              <Card
                key={item.id}
                padding="sm"
                onClick={() => void markRead(item)}
                // `Card` renderiza uma <div> — sem role/tabIndex/onKeyDown, um usuário de teclado
                // nunca alcançava nem conseguia marcar uma notificação como lida (falha real de
                // WCAG 2.1.1, achado do Piloto 021; mesmo padrão já usado em
                // DraggableActivity/Calendar.tsx).
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void markRead(item);
                  }
                }}
                className={`flex items-start gap-3 cursor-pointer transition-colors hover:border-line ${
                  lida ? 'opacity-60' : ''
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${color}`} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!lida && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${accent.bg}`}
                        role="img"
                        aria-label="não lida"
                      />
                    )}
                    <p className="text-sm font-semibold text-ink truncate">{item.title}</p>
                  </div>
                  {item.body && <p className="text-xs text-ink-2 mt-0.5">{item.body}</p>}
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-ink-2">
                    <span>{relativeTime(item.createdAt)}</span>
                    <span className="uppercase tracking-wide">{item.kind}</span>
                    {item.automation && (
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3 h-3" /> {item.automation.name}
                      </span>
                    )}
                  </div>
                </div>

                {canDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(item);
                    }}
                    disabled={busyId === item.id}
                    title="Remover"
                    aria-label={`Remover notificação ${item.title}`}
                    className="p-1.5 rounded-lg text-ink-2 hover:text-danger-active dark:hover:text-danger hover:bg-danger/10 transition-colors shrink-0 disabled:opacity-40"
                  >
                    {busyId === item.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {confirmDialog}
    </div>
  );
}
