import { api } from '../../lib/api';

export type NotificationKind = 'Info' | 'Sucesso' | 'Alerta' | 'Erro';

export interface NotificationItem {
    id: string;
    title: string;
    body: string | null;
    kind: NotificationKind;
    entity: string | null;
    entityId: string | null;
    readAt: string | null;
    createdAt: string;
    automation: { id: string; name: string } | null;
}

export const notificationsApi = {
    list: (onlyUnread: boolean) =>
        api.get<{ items: NotificationItem[]; unread: number }>(
            `/api/notifications${onlyUnread ? '?unread=1' : ''}`,
        ),
    markRead: (id: string) => api.post<{ id: string }>(`/api/notifications/${id}/read`),
    markAllRead: () => api.post<{ count: number }>('/api/notifications/read-all'),
    remove: (id: string) => api.delete<void>(`/api/notifications/${id}`),
};

/** "há 5 min", "há 2 h", "ontem" — mais legível que a data cheia numa lista de avisos. */
export function relativeTime(iso: string, now = new Date()): string {
    const diffMs = now.getTime() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60_000);

    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;

    const hours = Math.floor(min / 60);
    if (hours < 24) return `há ${hours} h`;

    const days = Math.floor(hours / 24);
    if (days === 1) return 'ontem';
    if (days < 30) return `há ${days} dias`;

    return new Date(iso).toLocaleDateString('pt-BR');
}
