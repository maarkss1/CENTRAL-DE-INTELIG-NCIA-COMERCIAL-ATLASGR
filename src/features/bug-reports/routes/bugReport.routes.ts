import { Router } from 'express';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { container } from '../../../shared/di/container.js';
import type { BugReportController } from '../presentation/BugReportController.js';

export const bugReportRouter = Router();

// POST /api/bug-reports — qualquer papel autenticado pode reportar um problema (inclusive
// VISUALIZADOR). Sem requireRole de propósito: restringir quem pode relatar um bug é o oposto do
// objetivo deste módulo. Contido por BUG_REPORT_RATE_LIMIT_MAX por organização (ver server.ts).
bugReportRouter.post('/', (req, res, next) =>
  container.resolve<BugReportController>('BugReportController').createBugReport(req, res, next),
);

// GET /api/bug-reports — lista os relatos da própria organização. Restrito a ADMIN/GESTOR.
bugReportRouter.get('/', requireRole(['ADMIN', 'GESTOR']), (req, res, next) =>
  container.resolve<BugReportController>('BugReportController').listBugReports(req, res, next),
);

// PATCH /api/bug-reports/:id/status — triagem (OPEN → TRIAGED → RESOLVED).
bugReportRouter.patch('/:id/status', requireRole(['ADMIN', 'GESTOR']), (req, res, next) =>
  container
    .resolve<BugReportController>('BugReportController')
    .updateBugReportStatus(req, res, next),
);
