import { prisma } from '../../../lib/prisma.js';
import type { getTenantPrisma } from '../../../lib/tenant-prisma.js';

// União exata dos dois valores que o caller pode passar (`req.db || prisma`, ver
// authenticateToken.ts) — um `Pick<typeof prisma, ...>` estrutural quebra o typecheck aqui porque
// o client estendido por $extends() usa `Exact<>` internamente, que não sobrevive a Pick.
type Db = typeof prisma | ReturnType<typeof getTenantPrisma>;

export async function listPendingActions(db: Db, organizationId: string) {
    return db.aIPendingAction.findMany({
        where: { approved: false, organizationId },
        orderBy: { id: 'desc' },
    });
}

export async function approvePendingAction(db: Db, organizationId: string, id: string) {
    const pendingAction = await db.aIPendingAction.findFirst({
        where: { id, organizationId, approved: false },
    });
    if (!pendingAction) {
        return null;
    }
    return db.aIPendingAction.update({ where: { id }, data: { approved: true } });
}

export async function discardPendingAction(db: Db, organizationId: string, id: string) {
    const pendingAction = await db.aIPendingAction.findFirst({
        where: { id, organizationId, approved: false },
    });
    if (!pendingAction) {
        return false;
    }
    await db.aIPendingAction.delete({ where: { id: pendingAction.id } });
    return true;
}
