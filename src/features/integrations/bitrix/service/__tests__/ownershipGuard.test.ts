import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
    lead: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
};
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const notificationServiceMock = { create: vi.fn().mockResolvedValue({ id: 'notif-1' }) };
vi.mock('../../../../notifications/notification.service.js', () => ({ notificationService: notificationServiceMock }));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('findOwnershipConflict', () => {
    it('sem telefone nem e-mail, nunca consulta o banco e devolve null', async () => {
        const { findOwnershipConflict } = await import('../ownershipGuard.js');
        const result = await findOwnershipConflict('org-1', { phone: null, email: null }, 'Ana');
        expect(result).toBeNull();
        expect(prismaMock.lead.findFirst).not.toHaveBeenCalled();
    });

    it('quando não há lead ativo com esse contato, devolve null', async () => {
        prismaMock.lead.findFirst.mockResolvedValue(null);
        const { findOwnershipConflict } = await import('../ownershipGuard.js');
        const result = await findOwnershipConflict('org-1', { phone: '11999999999', email: null }, 'Ana');
        expect(result).toBeNull();
    });

    it('lead ativo do MESMO dono não é conflito', async () => {
        prismaMock.lead.findFirst.mockResolvedValue({ id: 'lead-1', owner: 'Ana', title: 'Negócio X' });
        const { findOwnershipConflict } = await import('../ownershipGuard.js');
        const result = await findOwnershipConflict('org-1', { phone: '11999999999', email: null }, 'Ana');
        expect(result).toBeNull();
    });

    it('lead ativo de OUTRO dono é conflito — devolve o dono e o título existentes', async () => {
        prismaMock.lead.findFirst.mockResolvedValue({ id: 'lead-1', owner: 'Bruno', title: 'Negócio Y' });
        const { findOwnershipConflict } = await import('../ownershipGuard.js');
        const result = await findOwnershipConflict('org-1', { phone: '11999999999', email: null }, 'Ana');
        expect(result).toEqual({ existingLeadId: 'lead-1', existingOwner: 'Bruno', existingTitle: 'Negócio Y' });
    });

    it('lead ativo sem responsável (owner null) não bloqueia — a query já exige owner preenchido, mas reforça aqui', async () => {
        prismaMock.lead.findFirst.mockResolvedValue({ id: 'lead-1', owner: null, title: 'Negócio Z' });
        const { findOwnershipConflict } = await import('../ownershipGuard.js');
        const result = await findOwnershipConflict('org-1', { phone: '11999999999', email: null }, 'Ana');
        expect(result).toBeNull();
    });

    it('quando o importador ainda não tem dono resolvido (incomingOwnerName null), qualquer dono existente conta como conflito', async () => {
        prismaMock.lead.findFirst.mockResolvedValue({ id: 'lead-1', owner: 'Bruno', title: 'Negócio Y' });
        const { findOwnershipConflict } = await import('../ownershipGuard.js');
        const result = await findOwnershipConflict('org-1', { phone: null, email: 'contato@empresa.com' }, null);
        expect(result).toEqual({ existingLeadId: 'lead-1', existingOwner: 'Bruno', existingTitle: 'Negócio Y' });
    });
});

describe('notifyOwnershipConflict', () => {
    it('cria uma notificação Alerta apontando o negócio existente e o dono atual (owner legado = nome, sem User.id correspondente)', async () => {
        prismaMock.user.findFirst.mockResolvedValue(null);
        const { notifyOwnershipConflict } = await import('../ownershipGuard.js');
        await notifyOwnershipConflict('org-1', { existingLeadId: 'lead-1', existingOwner: 'Bruno', existingTitle: 'Negócio Y' }, 'Negócio Novo');

        expect(notificationServiceMock.create).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: 'org-1',
                kind: 'Alerta',
                entity: 'Lead',
                entityId: 'lead-1',
                body: expect.stringContaining('Bruno'),
            }),
        );
    });

    it('resolve owner por User.id (convenção pós-correção) para um nome legível na notificação, em vez de vazar o cuid cru', async () => {
        prismaMock.user.findFirst.mockResolvedValue({ name: 'Bruno Lima' });
        const { notifyOwnershipConflict } = await import('../ownershipGuard.js');
        await notifyOwnershipConflict('org-1', { existingLeadId: 'lead-1', existingOwner: 'cuid-user-bruno', existingTitle: 'Negócio Y' }, 'Negócio Novo');

        expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'cuid-user-bruno', organizationId: 'org-1' } }),
        );
        expect(notificationServiceMock.create).toHaveBeenCalledWith(
            expect.objectContaining({ body: expect.stringContaining('Bruno Lima') }),
        );
    });
});
