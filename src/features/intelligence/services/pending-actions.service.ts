import { prisma } from '../../../lib/prisma.js';
import type { getTenantPrisma } from '../../../lib/tenant-prisma.js';
import { executeAndRecord, type ExecutionResult } from './aiPendingAction.service.js';

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

/**
 * Aprova e tenta executar a ação de fato (IA-005) — antes disso, "aprovar" só marcava um flag no
 * banco e nada consumia isso depois. `execution.sent` diz pro chamador se realmente foi enviado;
 * quando não (`not_configured`/`send_failed`), a tela ainda pode cair no fallback manual.
 */
export async function approvePendingAction(db: Db, organizationId: string, id: string): Promise<{ action: Awaited<ReturnType<typeof db.aIPendingAction.update>>; execution: ExecutionResult } | null> {
    const pendingAction = await db.aIPendingAction.findFirst({
        where: { id, organizationId, approved: false },
    });
    if (!pendingAction) {
        return null;
    }
    const action = await db.aIPendingAction.update({ where: { id }, data: { approved: true } });
    const execution = await executeAndRecord(action);
    return { action, execution };
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
