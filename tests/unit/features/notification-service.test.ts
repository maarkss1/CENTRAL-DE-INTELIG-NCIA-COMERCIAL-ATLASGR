import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        notification: {
            create: vi.fn(), findMany: vi.fn(), count: vi.fn(),
            updateMany: vi.fn(), deleteMany: vi.fn(),
        },
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { notificationService } from '@/features/notifications/notification.service';

const notif = prisma.notification as unknown as Record<string, ReturnType<typeof vi.fn>>;
const ORG = 'org-1';
const USER = 'user-1';

beforeEach(() => vi.clearAllMocks());

describe('NotificationService.create', () => {
    it('aplica os padrões: kind Info e destinatário para toda a organização', async () => {
        notif.create.mockResolvedValue({ id: 'n1' });
        await notificationService.create({ organizationId: ORG, title: 'Olá' });

        const { data } = notif.create.mock.calls[0][0];
        expect(data.kind).toBe('Info');
        expect(data.userId).toBeNull();
        expect(data.body).toBeNull();
    });

    it('NUNCA lança: notificação é efeito colateral e não pode derrubar a ação que a originou', async () => {
        notif.create.mockRejectedValue(new Error('tabela ainda não migrada'));

        await expect(notificationService.create({ organizationId: ORG, title: 'x' }))
            .resolves.toBeNull();
        expect(logger.error).toHaveBeenCalled();
    });
});

describe('NotificationService.list', () => {
    it('traz as do usuário e as endereçadas à organização inteira', async () => {
        notif.findMany.mockResolvedValue([]);
        await notificationService.list(ORG, USER);

        const { where } = notif.findMany.mock.calls[0][0];
        expect(where.organizationId).toBe(ORG);
        expect(where.OR).toEqual([{ userId: USER }, { userId: null }]);
        // Sem filtro de leitura quando não se pede só as não lidas.
        expect(where.readAt).toBeUndefined();
    });

    it('filtra por não lidas quando pedido', async () => {
        notif.findMany.mockResolvedValue([]);
        await notificationService.list(ORG, USER, true);
        expect(notif.findMany.mock.calls[0][0].where.readAt).toBeNull();
    });

    it('limita o tamanho da lista — o sino não pagina', async () => {
        notif.findMany.mockResolvedValue([]);
        await notificationService.list(ORG, USER);
        expect(notif.findMany.mock.calls[0][0].take).toBe(50);
    });
});

describe('NotificationService.markRead', () => {
    it('devolve false quando o id não é do tenant, sem alterar nada', async () => {
        notif.updateMany.mockResolvedValue({ count: 0 });
        expect(await notificationService.markRead(ORG, 'de-outro-tenant')).toBe(false);
    });

    it('escopa a atualização por organização e só age sobre não lidas', async () => {
        notif.updateMany.mockResolvedValue({ count: 1 });
        expect(await notificationService.markRead(ORG, 'n1')).toBe(true);

        const { where } = notif.updateMany.mock.calls[0][0];
        expect(where).toMatchObject({ id: 'n1', organizationId: ORG, readAt: null });
    });

    it('markAllRead devolve quantas foram marcadas', async () => {
        notif.updateMany.mockResolvedValue({ count: 4 });
        expect(await notificationService.markAllRead(ORG, USER)).toBe(4);
    });
});

describe('NotificationService.remove', () => {
    it('não apaga notificação de outro tenant', async () => {
        notif.deleteMany.mockResolvedValue({ count: 0 });
        expect(await notificationService.remove(ORG, 'alheia')).toBe(false);
        expect(notif.deleteMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG });
    });
});
