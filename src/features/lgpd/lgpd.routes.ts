import { Router, Request, Response, NextFunction } from 'express';
import { lgpdService } from './lgpd.service.js';

export const lgpdRouter = Router();

// Exclusão / Anonimização de Titular (LGPD Art. 18)
lgpdRouter.delete('/titular/:contactId', (req: Request, res: Response, next: NextFunction): void => {
    (async () => {
        const organizationId = (req as any).user?.organizationId || req.headers['x-organization-id'] as string;
        if (!organizationId) {
            res.status(400).json({ error: 'organizationId é obrigatório' });
            return;
        }

        const { contactId } = req.params;
        const result = await lgpdService.eraseContact(organizationId, contactId);

        res.json({
            message: 'Dados do titular anonimizados com sucesso.',
            result
        });
    })().catch(next);
});

// Exportação / Portabilidade de Titular (LGPD Art. 18 V)
lgpdRouter.get('/titular/:contactId/export', (req: Request, res: Response, next: NextFunction): void => {
    (async () => {
        const organizationId = (req as any).user?.organizationId || req.headers['x-organization-id'] as string;
        if (!organizationId) {
            res.status(400).json({ error: 'organizationId é obrigatório' });
            return;
        }

        const { contactId } = req.params;
        const data = await lgpdService.exportContactData(organizationId, contactId);

        res.json(data);
    })().catch(next);
});
