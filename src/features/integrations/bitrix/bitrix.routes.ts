import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import {
    connectBitrix,
    getBitrixStatus,
    disconnectBitrix,
    listBitrixLeads,
    importSelectedBitrixLeads,
    getDealPipelines,
    getDealStages,
    getBitrixUsers,
    listBitrixDeals,
    importSelectedBitrixDeals,
} from './bitrix.service.js';

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

// ── Importação a partir de Deals (Negócios) — funil real com pipeline/etapa ────────────────────

router.get('/deal-pipelines', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const result = await getDealPipelines(organizationId);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.get('/deal-stages', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const categoryId = String(req.query.categoryId || '');
        if (!categoryId) {
            res.status(400).json({ success: false, error: 'Informe categoryId.' });
            return;
        }
        const result = await getDealStages(organizationId, categoryId);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.get('/users', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const result = await getBitrixUsers(organizationId);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.get('/deals', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const start = Number(req.query.start) || 0;
        const month = req.query.month ? Number(req.query.month) : undefined;
        const year = req.query.year ? Number(req.query.year) : undefined;
        const result = await listBitrixDeals(organizationId, start, {
            categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
            stageId: req.query.stageId ? String(req.query.stageId) : undefined,
            assignedById: req.query.assignedById ? String(req.query.assignedById) : undefined,
            month: Number.isInteger(month) && month! >= 1 && month! <= 12 ? month : undefined,
            year: Number.isInteger(year) && year! > 2000 ? year : undefined,
        });
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.post('/deals/import', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { bitrixDealIds } = req.body as { bitrixDealIds?: unknown };
        if (!Array.isArray(bitrixDealIds) || bitrixDealIds.some((id) => typeof id !== 'string')) {
            res.status(400).json({ success: false, error: 'bitrixDealIds deve ser uma lista de strings.' });
            return;
        }
        const result = await importSelectedBitrixDeals(organizationId, bitrixDealIds);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

export const bitrixRoutes = router;
