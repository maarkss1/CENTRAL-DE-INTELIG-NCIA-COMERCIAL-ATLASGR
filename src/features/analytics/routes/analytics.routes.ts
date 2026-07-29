import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../../lib/prisma.js';
import { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';

const router = Router();

// Visão geral usada pelo LiveStatsWidget (home) e pelo ReportsHub (relatório executivo por IA).
// Não há um campo de valor monetário no modelo Lead ainda, então pipelineValue fica em 0 até essa
// coluna existir — o frontend já trata 0 como "R$ —" em vez de inventar um número.
router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [
            totalCompanies,
            totalContacts,
            totalLeads,
            totalActivities,
            pendingActivities,
            closedThisMonth,
            closedWonLeads,
        ] = await Promise.all([
            prisma.company.count({ where: { organizationId, deletedAt: null } }),
            prisma.contact.count({ where: { organizationId, deletedAt: null } }),
            prisma.lead.count({
                where: {
                    organizationId,
                    deletedAt: null,
                    status: { notIn: ['Fechado_Ganho', 'Fechado_Perdido'] },
                },
            }),
            prisma.activity.count({ where: { organizationId, deletedAt: null } }),
            prisma.activity.count({ where: { organizationId, deletedAt: null, status: 'Pendente' } }),
            prisma.lead.count({
                where: {
                    organizationId,
                    deletedAt: null,
                    status: 'Fechado_Ganho',
                    updatedAt: { gte: startOfMonth },
                },
            }),
            prisma.lead.count({ where: { organizationId, deletedAt: null, status: 'Fechado_Ganho' } }),
        ]);

        const totalLeadsEverCreated = await prisma.lead.count({ where: { organizationId, deletedAt: null } });
        const conversionRate = totalLeadsEverCreated > 0 ? (closedWonLeads / totalLeadsEverCreated) * 100 : 0;

        res.json({
            success: true,
            data: {
                totalCompanies,
                totalContacts,
                totalLeads,
                totalActivities,
                pendingActivities,
                closedThisMonth,
                pipelineValue: 0,
                conversionRate,
            },
        });
    } catch (error) {
        next(error);
    }
});

export const analyticsRoutes = router;
