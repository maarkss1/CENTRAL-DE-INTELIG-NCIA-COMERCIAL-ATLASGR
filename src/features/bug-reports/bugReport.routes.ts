import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../shared/middlewares/requireRole.js';
import { bugReportService } from './bugReport.service.js';

export const bugReportRouter = Router();

// POST /api/bug-reports — qualquer papel autenticado pode reportar um problema (inclusive
// VISUALIZADOR). Sem requireRole de propósito: restringir quem pode relatar um bug é o oposto do
// objetivo deste módulo. Contido por BUG_REPORT_RATE_LIMIT_MAX por organização (ver server.ts).
bugReportRouter.post('/', (req: Request, res: Response, next: NextFunction): void => {
    (async () => {
        const { organizationId, id: userId, email } = (req as AuthRequest).user;
        const { title, description, severity, context } = req.body as {
            title?: unknown;
            description?: unknown;
            severity?: unknown;
            context?: unknown;
        };

        if (typeof title !== 'string' || typeof description !== 'string') {
            res.status(400).json({ success: false, error: '"title" e "description" são obrigatórios.' });
            return;
        }

        const report = await bugReportService.create({
            organizationId,
            userId,
            userEmail: email,
            title,
            description,
            severity: typeof severity === 'string' ? severity : undefined,
            context: context && typeof context === 'object' ? (context as Record<string, unknown>) : {},
        });

        res.status(201).json({ success: true, data: { id: report.id, status: report.status } });
    })().catch(next);
});

// GET /api/bug-reports — lista os relatos da própria organização. Restrito a ADMIN/GESTOR: quem
// relata não precisa (nem deveria) enxergar todos os relatos de todo mundo, só confirmar que o
// seu foi enviado (resposta do POST acima já basta pra isso).
bugReportRouter.get('/', requireRole(['ADMIN', 'GESTOR']), (req: Request, res: Response, next: NextFunction): void => {
    (async () => {
        const { organizationId } = (req as AuthRequest).user;
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const reports = await bugReportService.listForOrganization(organizationId, status);
        res.json({ success: true, data: reports });
    })().catch(next);
});

// PATCH /api/bug-reports/:id/status — triagem (OPEN → TRIAGED → RESOLVED).
bugReportRouter.patch('/:id/status', requireRole(['ADMIN', 'GESTOR']), (req: Request, res: Response, next: NextFunction): void => {
    (async () => {
        const { organizationId } = (req as AuthRequest).user;
        const { status } = req.body as { status?: unknown };

        if (typeof status !== 'string') {
            res.status(400).json({ success: false, error: '"status" é obrigatório.' });
            return;
        }

        const updated = await bugReportService.updateStatus(organizationId, req.params.id, status);
        res.json({ success: true, data: updated });
    })().catch(next);
});
