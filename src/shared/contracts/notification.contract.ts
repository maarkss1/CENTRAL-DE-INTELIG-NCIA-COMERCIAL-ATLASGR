/**
 * Fonte única de verdade para `NotificationKind` — a severidade de uma notificação do sino
 * (`src/features/notifications/**`). Até esta unificação, a mesma união literal existia declarada
 * de forma independente em `notification.service.ts` (backend, importa Prisma) e
 * `notifications.api.ts` (cliente HTTP do frontend), sem import compartilhado entre os dois
 * (achado do handoff `.agents/handoffs/onda-8/18-para-00-varredura-duplicacao-contratos.md`, item 3).
 */
export type NotificationKind = 'Info' | 'Sucesso' | 'Alerta' | 'Erro';
