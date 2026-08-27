/**
 * Onda 39 (auditoria CPI — "trilha completa de aprovação"): AIPendingAction registrava
 * approved/approvedAt/discardedAt, mas nunca QUEM aprovou/descartou (só um flag + timestamp, sem
 * ator). approvePendingAction/discardPendingAction agora recebem o actorId (sempre de req.user na
 * rota autenticada, nunca do body) e persistem approvedBy/discardedBy.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn();
const update = vi.fn();
vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: { aIPendingAction: { findFirst: (...args: unknown[]) => findFirst(...args), update: (...args: unknown[]) => update(...args) } },
}));

const executeAndRecord = vi.fn();
vi.mock('../../../../../src/features/intelligence/services/aiPendingAction.service.js', () => ({
    executeAndRecord: (...args: unknown[]) => executeAndRecord(...args),
}));

const { approvePendingAction, discardPendingAction } = await import('../../../../../src/features/intelligence/services/pending-actions.service.js');
const { prisma } = await import('../../../../../src/lib/prisma.js');

afterEach(() => {
    vi.clearAllMocks();
});

describe('approvePendingAction', () => {
    it('grava approvedBy com o actorId de quem aprovou, nunca inferido', async () => {
        findFirst.mockResolvedValue({ id: 'pending-1', organizationId: 'org-1' });
        update.mockResolvedValue({ id: 'pending-1', approved: true, approvedBy: 'user-42' });
        executeAndRecord.mockResolvedValue({ sent: true });

        const result = await approvePendingAction(prisma, 'org-1', 'pending-1', 'user-42');

        expect(update).toHaveBeenCalledWith({
            where: { id: 'pending-1' },
            data: expect.objectContaining({ approved: true, approvedBy: 'user-42' }),
        });
        expect(result?.execution).toEqual({ sent: true });
    });

    it('devolve null sem chamar update quando a ação não existe (ou já foi decidida) neste tenant', async () => {
        findFirst.mockResolvedValue(null);

        const result = await approvePendingAction(prisma, 'org-1', 'pending-inexistente', 'user-42');

        expect(result).toBeNull();
        expect(update).not.toHaveBeenCalled();
        expect(executeAndRecord).not.toHaveBeenCalled();
    });
});

describe('discardPendingAction', () => {
    it('grava discardedBy com o actorId de quem descartou', async () => {
        findFirst.mockResolvedValue({ id: 'pending-2', organizationId: 'org-1' });
        update.mockResolvedValue({ id: 'pending-2', discardedBy: 'user-7' });

        const result = await discardPendingAction(prisma, 'org-1', 'pending-2', 'user-7');

        expect(result).toBe(true);
        expect(update).toHaveBeenCalledWith({
            where: { id: 'pending-2' },
            data: expect.objectContaining({ discardedBy: 'user-7' }),
        });
    });

    it('devolve false sem chamar update quando a ação não existe neste tenant', async () => {
        findFirst.mockResolvedValue(null);

        const result = await discardPendingAction(prisma, 'org-1', 'pending-inexistente', 'user-7');

        expect(result).toBe(false);
        expect(update).not.toHaveBeenCalled();
    });
});
