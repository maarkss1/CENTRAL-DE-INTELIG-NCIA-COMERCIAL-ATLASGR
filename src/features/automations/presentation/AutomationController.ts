import { Request, Response, NextFunction } from 'express';
import { AutomationUseCases, AUTOMATION_TRIGGERS, AUTOMATION_ACTIONS } from '../application/AutomationUseCases';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken';

export class AutomationController {
    constructor(private automationUseCases: AutomationUseCases) {}

    getOptions = (_req: Request, res: Response) => {
        res.json({
            success: true,
            data: { triggers: AUTOMATION_TRIGGERS, actions: AUTOMATION_ACTIONS },
        });
    };

    getAutomations = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { organizationId } = (req as AuthRequest).user;
            res.json({ success: true, data: await this.automationUseCases.listAutomations(organizationId) });
        } catch (error) {
            next(error);
        }
    };

    createAutomation = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { organizationId } = (req as AuthRequest).user;
            const created = await this.automationUseCases.createAutomation(organizationId, req.body);
            res.status(201).json({ success: true, data: created });
        } catch (error) {
            next(error);
        }
    };

    updateAutomation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { organizationId } = (req as AuthRequest).user;
            const updated = await this.automationUseCases.updateAutomation(organizationId, req.params.id, req.body);
            if (!updated) {
                res.status(404).json({ success: false, error: 'Automação não encontrada.' });
                return;
            }
            res.json({ success: true, data: updated });
        } catch (error) {
            next(error);
        }
    };

    deleteAutomation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { organizationId } = (req as AuthRequest).user;
            const ok = await this.automationUseCases.removeAutomation(organizationId, req.params.id);
            if (!ok) {
                res.status(404).json({ success: false, error: 'Automação não encontrada.' });
                return;
            }
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    };
}
