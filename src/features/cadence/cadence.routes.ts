import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../shared/middlewares/authenticateToken.js';
import { AppError } from '../../shared/middlewares/errorHandler.js';
import { prismaOptOutRepository } from './infra/PrismaOptOutRepository.js';
import { prismaCadenceRunRepository } from './infra/PrismaCadenceRunRepository.js';
import type { CadenceRunStatus } from './domain/cadence.js';

/**
 * Router de cadência multicanal e opt-out unificado (Agente 17, Onda 10). Só leitura por
 * enquanto — a tela (`CadenceHub.tsx`, `cadence.api.ts`) consome exatamente estes dois endpoints.
 * Ação de escrita (pausar/retomar/parar run) fica para uma leva futura, quando o scheduler/canais
 * (05/06/12) já estiverem chamando `advanceCadenceRun` de verdade — ver nota no handoff
 * `.agents/handoffs/onda-7/17-para-02-rota-cadencia.md`.
 *
 * Mesmo padrão de autenticação/tenant isolation de todo router deste projeto: `authenticateToken`
 * + `requireTenant` são aplicados na montagem (`server.ts`), nunca aqui — `req.user.organizationId`
 * já vem resolvido e o Prisma já aplica RLS por `requestContext` (ver `src/lib/prisma.ts`). Sem
 * `requireRole`: qualquer papel autenticado (inclusive VISUALIZADOR) pode ver opt-outs e runs de
 * cadência da própria organização — é leitura, não ação de disparo.
 */

const router = Router();

/** Enum Postgres (PascalCase) aceito na query `?status=Active,Paused` — mesma casing de `CadenceRunStatus` no schema, para não obrigar quem chama a API a conhecer a convenção lowercase do domínio interno. */
const STATUS_QUERY_TO_DOMAIN: Record<string, CadenceRunStatus> = {
    Active: 'active',
    Paused: 'paused',
    Stopped: 'stopped',
};

function parseStatusFilter(raw: unknown): CadenceRunStatus[] | undefined {
    if (typeof raw !== 'string' || raw.trim().length === 0) return undefined;
    const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
    const parsed = values.map((v) => {
        const mapped = STATUS_QUERY_TO_DOMAIN[v];
        if (!mapped) {
            throw new AppError(`Status de cadência inválido: '${v}'. Use Active, Paused e/ou Stopped.`, 400);
        }
        return mapped;
    });
    return parsed.length > 0 ? parsed : undefined;
}

router.get('/opt-outs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const records = await prismaOptOutRepository.list(organizationId);
        res.json({ success: true, data: records });
    } catch (error) {
        next(error);
    }
});

router.get('/runs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const status = parseStatusFilter(req.query.status);
        const runs = await prismaCadenceRunRepository.listByOrganization(organizationId, status ? { status } : undefined);
        res.json({ success: true, data: runs });
    } catch (error) {
        next(error);
    }
});

export const cadenceRoutes = router;
