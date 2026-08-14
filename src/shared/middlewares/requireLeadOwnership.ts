import { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from './authenticateToken.js';
import { prisma } from '../../lib/prisma.js';

/**
 * VENDEDOR só pode editar/excluir/reenriquecer os leads que capturou (Lead.owner === user.id) —
 * GESTOR/ADMIN já são liberados por `requireRole` antes desta checagem e continuam sem restrição
 * de dono (gerenciam qualquer lead da organização). `owner` guarda o `User.id` de quem capturou o
 * lead (atribuição manual em LeadUseCases.createLead ou round-robin em assignment.service.ts),
 * nunca um nome — comparação direta é segura.
 */
export function requireLeadOwnership() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const authReq = req as AuthRequest;

        if (authReq.user.role !== 'VENDEDOR') {
            next();
            return;
        }

        const lead = await prisma.lead.findFirst({
            where: { id: req.params.id, organizationId: authReq.user.organizationId },
            select: { owner: true },
        });

        if (!lead) {
            res.status(404).json({ success: false, error: 'Lead not found' });
            return;
        }

        if (lead.owner !== authReq.user.id) {
            res.status(403).json({
                success: false,
                error: 'Você só pode editar leads que você capturou.',
            });
            return;
        }

        next();
    };
}
