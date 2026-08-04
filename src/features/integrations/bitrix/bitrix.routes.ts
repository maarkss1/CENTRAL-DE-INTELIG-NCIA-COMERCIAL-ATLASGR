import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { connectBitrix, getBitrixStatus, disconnectBitrix, listBitrixLeads, importSelectedBitrixLeads } from './bitrix.service.js';

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

// Lista uma página de leads do Bitrix24 para a pessoa escolher o que importar — nunca grava
// nada sozinho (ver bitrix.service.ts sobre por que a importação é sempre seletiva/manual).
router.get('/leads', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const start = Number(req.query.start) || 0;
        const result = await listBitrixLeads(organizationId, start);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.post('/leads/import', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { bitrixLeadIds } = req.body as { bitrixLeadIds?: unknown };
        if (!Array.isArray(bitrixLeadIds) || bitrixLeadIds.some((id) => typeof id !== 'string')) {
            res.status(400).json({ success: false, error: 'bitrixLeadIds deve ser uma lista de strings.' });
            return;
        }
        const result = await importSelectedBitrixLeads(organizationId, bitrixLeadIds);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

export const bitrixRoutes = router;
