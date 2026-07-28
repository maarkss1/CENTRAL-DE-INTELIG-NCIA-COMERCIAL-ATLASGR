import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';

const router = Router();

// Estatísticas gerais da plataforma para o LiveStatsWidget (Home).
router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const db = (req as AuthRequest).db;
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [totalCompanies, totalContacts, totalLeads, totalActivities, pendingActivities, closedThisMonth, closedWon, closedLost] = await Promise.all([
            db.company.count(),
            db.contact.count(),
            db.lead.count({ where: { status: { notIn: ['Fechado_Ganho', 'Fechado_Perdido'] } } }),
            db.activity.count(),
            db.activity.count({ where: { status: 'Pendente' } }),
            db.lead.count({ where: { status: 'Fechado_Ganho', updatedAt: { gte: startOfMonth } } }),
            db.lead.count({ where: { status: 'Fechado_Ganho' } }),
            db.lead.count({ where: { status: 'Fechado_Perdido' } }),
        ]);

        const closedTotal = closedWon + closedLost;
        const conversionRate = closedTotal > 0 ? (closedWon / closedTotal) * 100 : 0;

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
