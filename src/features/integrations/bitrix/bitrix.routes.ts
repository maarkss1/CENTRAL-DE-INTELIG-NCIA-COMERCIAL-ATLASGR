import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { connectBitrix, getBitrixStatus, disconnectBitrix } from './bitrix.service.js';

const router = Router();

router.get('/status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const status = await getBitrixStatus(organizationId);
        res.json({ success: true, data: status });
    } catch (error) {
        next(error);
    }
});

// Valida a URL do webhook contra o Bitrix24 de verdade (chamada real a profile.json) antes de
// salvar — assim um erro de digitação ou token revogado aparece na hora, não só na primeira
// exportação de lead.
router.post('/connect', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { webhookUrl } = req.body;
        const result = await connectBitrix(organizationId, webhookUrl);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.post('/disconnect', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        await disconnectBitrix(organizationId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

export const bitrixRoutes = router;
