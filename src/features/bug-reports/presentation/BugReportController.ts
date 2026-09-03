import type { Request, Response, NextFunction } from 'express';
import type { BugReportUseCases } from '../application/BugReportUseCases.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { routeParam } from '../../../shared/http/routeParams.js';

export class BugReportController {
  constructor(private bugReportUseCases: BugReportUseCases) {}

  // Sem requireRole nesta rota de propósito — restringir quem pode relatar um bug é o oposto do
  // objetivo deste módulo. Contido por BUG_REPORT_RATE_LIMIT_MAX por organização (ver server.ts).
  createBugReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId, id: userId, email } = (req as AuthRequest).user;
      const { title, description, severity, context } = req.body as {
        title?: unknown;
        description?: unknown;
        severity?: unknown;
        context?: unknown;
      };

      if (typeof title !== 'string' || typeof description !== 'string') {
        res
          .status(400)
          .json({ success: false, error: '"title" e "description" são obrigatórios.' });
        return;
      }

      const report = await this.bugReportUseCases.createBugReport({
        organizationId,
        userId,
        userEmail: email,
        title,
        description,
        severity: typeof severity === 'string' ? severity : undefined,
        context: context && typeof context === 'object' ? (context as Record<string, unknown>) : {},
      });

      res.status(201).json({ success: true, data: { id: report.id, status: report.status } });
    } catch (error) {
      next(error);
    }
  };

  // Restrito a ADMIN/GESTOR (requireRole aplicado na rota): quem relata não precisa (nem
  // deveria) enxergar todos os relatos de todo mundo, só confirmar que o seu foi enviado
  // (resposta do POST acima já basta pra isso).
  listBugReports = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const reports = await this.bugReportUseCases.listBugReports(organizationId, status);
      res.json({ success: true, data: reports });
    } catch (error) {
      next(error);
    }
  };

  updateBugReportStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const { status } = req.body as { status?: unknown };

      if (typeof status !== 'string') {
        res.status(400).json({ success: false, error: '"status" é obrigatório.' });
        return;
      }

      const updated = await this.bugReportUseCases.updateBugReportStatus(
        organizationId,
        routeParam(req.params.id, 'id'),
        status,
      );
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  };
}
