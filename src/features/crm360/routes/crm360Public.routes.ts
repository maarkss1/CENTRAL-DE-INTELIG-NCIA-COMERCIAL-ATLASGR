import { Router } from 'express';
import { container } from '../../../shared/di/container.js';
import type { Crm360Controller } from '../presentation/Crm360Controller.js';

/**
 * CYC-005 (onda 25) — rota pública de visualização de proposta. Nunca passa por
 * `authenticateToken`/`requireTenant` (montada em `server.ts` fora do bloco autenticado, mesmo
 * lugar dos webhooks de integração) — o cliente/lead que recebe o link não tem conta no sistema.
 * O `publicToken` (uuid, não adivinhável) na URL É a credencial, mesmo modelo de confiança já
 * usado para `BitrixConnection` (ver `src/lib/prisma.ts`). `apiLimiter` (montado globalmente em
 * `/api`) já cobre esta rota contra abuso de força bruta do token.
 */

const router = Router();

router.get('/:token/view', (req, res, next) =>
    container.resolve<Crm360Controller>('Crm360Controller').viewPublicDocument(req, res, next)
);

export const crm360PublicRoutes = router;
