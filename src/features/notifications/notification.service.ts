import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

export type NotificationKind = 'Info' | 'Sucesso' | 'Alerta' | 'Erro';

export interface CreateNotificationInput {
    organizationId: string;
    title: string;
    body?: string | null;
    kind?: NotificationKind;
    entity?: string | null;
    entityId?: string | null;
    /** `null`/ausente entrega para toda a organização. */
    userId?: string | null;
    automationId?: string | null;
}

/** Teto de itens devolvidos numa listagem — o sino não pagina. */
const LIST_LIMIT = 50;

export class NotificationService {
    /**
     * Cria uma notificação.
     *
     * Nunca lança: notificação é efeito colateral. Se a criação falhar (banco fora, tabela ainda
     * não migrada), quem disparou a ação principal — salvar um lead, concluir uma atividade — não
     * pode receber um erro por causa disso.
     */
    async create(input: CreateNotificationInput): Promise<{ id: string } | null> {
        try {
            return await prisma.notification.create({
                data: {
                    organizationId: input.organizationId,
                    title: input.title,
                    body: input.body ?? null,
                    kind: input.kind ?? 'Info',
                    entity: input.entity ?? null,
                    entityId: input.entityId ?? null,
                    userId: input.userId ?? null,
                    automationId: input.automationId ?? null,
                },
                select: { id: true },
            });
        } catch (err) {
            logger.error({ err, title: input.title }, 'Falha ao criar notificação');
            return null;
        }
    }

    /**
     * Lista as notificações visíveis para o usuário: as dele e as endereçadas à organização
     * inteira (`userId` nulo).
     */
    async list(organizationId: string, userId: string, onlyUnread = false) {
        return prisma.notification.findMany({
            where: {
                organizationId,
                OR: [{ userId }, { userId: null }],
                ...(onlyUnread ? { readAt: null } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: LIST_LIMIT,
            select: {
                id: true, title: true, body: true, kind: true,
                entity: true, entityId: true, readAt: true, createdAt: true,
                automation: { select: { id: true, name: true } },
            },
        });
    }

    async unreadCount(organizationId: string, userId: string): Promise<number> {
        return prisma.notification.count({
            where: { organizationId, readAt: null, OR: [{ userId }, { userId: null }] },
        });
    }

    /** Marca uma notificação como lida. Devolve `false` se ela não pertence ao tenant. */
    async markRead(organizationId: string, id: string): Promise<boolean> {
        const { count } = await prisma.notification.updateMany({
            where: { id, organizationId, readAt: null },
            data: { readAt: new Date() },
        });
        return count > 0;
    }

    async markAllRead(organizationId: string, userId: string): Promise<number> {
        const { count } = await prisma.notification.updateMany({
            where: { organizationId, readAt: null, OR: [{ userId }, { userId: null }] },
            data: { readAt: new Date() },
        });
        return count;
    }

    async remove(organizationId: string, id: string): Promise<boolean> {
        const { count } = await prisma.notification.deleteMany({ where: { id, organizationId } });
        return count > 0;
    }
}

export const notificationService = new NotificationService();
