import { Request, Response, NextFunction } from 'express';
import { ActivityUseCases } from '../application/ActivityUseCases';
import { AuthRequest } from '../../../shared/middlewares/authenticateToken';
import type { ActivityStatus, ActivityType } from '../../../lib/zod';

export class ActivityController {
    constructor(private activityUseCases: ActivityUseCases) {}

    getActivities = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { organizationId: orgId } = (req as AuthRequest).user;
            const { from, to, date, page, limit, leadId, status, type } = req.query as Record<string, string | undefined>;

            // `from`/`to` alimentam a grade do Calendário (um mês por requisição, sem paginação —
            // volume já é limitado pela janela de datas); os demais parâmetros servem a lista de
            // Agenda paginada.
            if (from && to) {
                const activities = await this.activityUseCases.findActivitiesRange(orgId, from, to);
                res.json({ success: true, data: activities });
                return;
            }

            const pageNum = page ? Number.parseInt(page, 10) : undefined;
            const limitNum = limit ? Number.parseInt(limit, 10) : undefined;

            const result = await this.activityUseCases.findActivitiesPaginated(
                orgId,
                date,
                pageNum !== undefined && Number.isFinite(pageNum) && pageNum > 0 ? pageNum : undefined,
                limitNum !== undefined && Number.isFinite(limitNum) && limitNum > 0 ? limitNum : undefined,
                {
                    leadId,
                    status: status as ActivityStatus | undefined,
                    type: type as ActivityType | undefined,
                }
            );

            res.json({ success: true, data: result.data, meta: result.meta });
        } catch (error) {
            next(error);
        }
    };

    createActivity = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { organizationId: orgId } = (req as AuthRequest).user;
            const activity = await this.activityUseCases.createActivity(orgId, req.body);
            res.status(201).json({ success: true, data: activity });
        } catch (error) {
            next(error);
        }
    };

    updateActivity = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { organizationId: orgId } = (req as AuthRequest).user;
            const activity = await this.activityUseCases.updateActivity(orgId, req.params.id, req.body);
            res.json({ success: true, data: activity });
        } catch (error) {
            next(error);
        }
    };

    deleteActivity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { organizationId: orgId } = (req as AuthRequest).user;
            await this.activityUseCases.deleteActivity(orgId, req.params.id);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    };
}
