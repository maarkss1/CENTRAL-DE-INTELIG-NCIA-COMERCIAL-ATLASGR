import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import {
    connectBitrix,
    listBitrixConnections,
    disconnectBitrix,
    listBitrixLeads,
    importSelectedBitrixLeads,
    getDealPipelines,
    getDealStages,
    getBitrixUsers,
    listBitrixDeals,
    importSelectedBitrixDeals,
    listSyncRules,
    createSyncRule,
    setSyncRuleActive,
    deleteSyncRule,
    getLeadStatuses,
    testBitrixConnection,
} from './bitrix.service.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';

const router = Router();
const managementRoles = requireRole(['ADMIN', 'GESTOR']);

// ── Conexões (uma organização pode ter mais de um portal Bitrix — ex.: AtlasGR e TotalTrac) ────

router.get('/connections', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const result = await listBitrixConnections(organizationId);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// Valida a URL do webhook contra o Bitrix24 de verdade (chamada real a profile.json) antes de
// salvar — assim um erro de digitação ou token revogado aparece na hora, não só na primeira
// exportação de lead.
router.post('/connect', managementRoles, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { webhookUrl, label } = req.body;
        const result = await connectBitrix(organizationId, webhookUrl, label);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.post('/connections/:connectionId/test', managementRoles, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const result = await testBitrixConnection(organizationId, req.params.connectionId);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.post('/disconnect/:connectionId', managementRoles, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        await disconnectBitrix(organizationId, req.params.connectionId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

function requireConnectionId(req: Request, res: Response): string | null {
    const connectionId = req.query.connectionId ? String(req.query.connectionId) : '';
    if (!connectionId) {
        res.status(400).json({ success: false, error: 'Informe connectionId (qual portal Bitrix consultar).' });
        return null;
    }
    return connectionId;
}

// Lista uma página de leads do Bitrix24 para a pessoa escolher o que importar — nunca grava
// nada sozinho (ver bitrix.service.ts sobre por que a importação é sempre seletiva/manual).
router.get('/leads', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const connectionId = requireConnectionId(req, res);
        if (!connectionId) return;
        const start = Number(req.query.start) || 0;
        const result = await listBitrixLeads(organizationId, connectionId, start, {
            search: req.query.search ? String(req.query.search) : undefined,
            statusId: req.query.statusId ? String(req.query.statusId) : undefined,
            assignedById: req.query.assignedById ? String(req.query.assignedById) : undefined,
        });
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.post('/leads/import', managementRoles, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { connectionId, bitrixLeadIds } = req.body as { connectionId?: unknown; bitrixLeadIds?: unknown };
        if (typeof connectionId !== 'string' || !connectionId) {
            res.status(400).json({ success: false, error: 'connectionId é obrigatório.' });
            return;
        }
        if (!Array.isArray(bitrixLeadIds) || bitrixLeadIds.some((id) => typeof id !== 'string')) {
            res.status(400).json({ success: false, error: 'bitrixLeadIds deve ser uma lista de strings.' });
            return;
        }
        const result = await importSelectedBitrixLeads(organizationId, connectionId, bitrixLeadIds);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// ── Importação a partir de Deals (Negócios) — funil real com pipeline/etapa ────────────────────

router.get('/deal-pipelines', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const connectionId = requireConnectionId(req, res);
        if (!connectionId) return;
        const result = await getDealPipelines(organizationId, connectionId);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.get('/deal-stages', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const connectionId = requireConnectionId(req, res);
        if (!connectionId) return;
        const categoryId = String(req.query.categoryId || '');
        if (!categoryId) {
            res.status(400).json({ success: false, error: 'Informe categoryId.' });
            return;
        }
        const result = await getDealStages(organizationId, connectionId, categoryId);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.get('/lead-statuses', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const connectionId = requireConnectionId(req, res);
        if (!connectionId) return;
        const result = await getLeadStatuses(organizationId, connectionId);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.get('/users', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const connectionId = requireConnectionId(req, res);
        if (!connectionId) return;
        const result = await getBitrixUsers(organizationId, connectionId);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.get('/deals', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const connectionId = requireConnectionId(req, res);
        if (!connectionId) return;
        const start = Number(req.query.start) || 0;
        const month = req.query.month ? Number(req.query.month) : undefined;
        const year = req.query.year ? Number(req.query.year) : undefined;
        const result = await listBitrixDeals(organizationId, connectionId, start, {
            categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
            stageId: req.query.stageId ? String(req.query.stageId) : undefined,
            assignedById: req.query.assignedById ? String(req.query.assignedById) : undefined,
            month: Number.isInteger(month) && month! >= 1 && month! <= 12 ? month : undefined,
            year: Number.isInteger(year) && year! > 2000 ? year : undefined,
            search: req.query.search ? String(req.query.search) : undefined,
        });
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.post('/deals/import', managementRoles, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { connectionId, bitrixDealIds } = req.body as { connectionId?: unknown; bitrixDealIds?: unknown };
        if (typeof connectionId !== 'string' || !connectionId) {
            res.status(400).json({ success: false, error: 'connectionId é obrigatório.' });
            return;
        }
        if (!Array.isArray(bitrixDealIds) || bitrixDealIds.some((id) => typeof id !== 'string')) {
            res.status(400).json({ success: false, error: 'bitrixDealIds deve ser uma lista de strings.' });
            return;
        }
        const result = await importSelectedBitrixDeals(organizationId, connectionId, bitrixDealIds);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// ── Sincronização automática (regras) ───────────────────────────────────────────────────────

router.get('/sync-rules', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const connectionId = requireConnectionId(req, res);
        if (!connectionId) return;
        const result = await listSyncRules(organizationId, connectionId);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.post('/sync-rules', managementRoles, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { connectionId, source, categoryId, stageId, assignedById } = req.body as {
            connectionId?: unknown; source?: unknown; categoryId?: unknown; stageId?: unknown; assignedById?: unknown;
        };
        if (typeof connectionId !== 'string' || !connectionId) {
            res.status(400).json({ success: false, error: 'connectionId é obrigatório.' });
            return;
        }
        if (source !== 'lead' && source !== 'deal') {
            res.status(400).json({ success: false, error: 'source deve ser "lead" ou "deal".' });
            return;
        }
        if (source === 'deal' && (typeof categoryId !== 'string' || !categoryId)) {
            res.status(400).json({ success: false, error: 'categoryId é obrigatório para regras de Negócio.' });
            return;
        }
        const result = await createSyncRule(organizationId, {
            connectionId,
            source,
            categoryId: typeof categoryId === 'string' ? categoryId : null,
            stageId: typeof stageId === 'string' ? stageId : null,
            assignedById: typeof assignedById === 'string' ? assignedById : null,
        });
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.put('/sync-rules/:id', managementRoles, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { active } = req.body as { active?: unknown };
        if (typeof active !== 'boolean') {
            res.status(400).json({ success: false, error: 'active deve ser booleano.' });
            return;
        }
        const result = await setSyncRuleActive(organizationId, req.params.id, active);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

router.delete('/sync-rules/:id', managementRoles, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        await deleteSyncRule(organizationId, req.params.id);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

export const bitrixRoutes = router;
