import { Router, Request, Response } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { crmEventBus, CrmEvent } from '../../../lib/eventsBus.js';

const router = Router();
const readRoles = requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);

/**
 * GET /api/events
 * Endpoint SSE para transmitir eventos comerciais em tempo real.
 */
router.get('/', readRoles, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { organizationId } = authReq.user;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n'); // keep-alive space

  const listener = (event: CrmEvent) => {
    if (event.organizationId === organizationId) {
      res.write(`event: crm_event\ndata: ${JSON.stringify(event)}\n\n`);
    }
  };

  crmEventBus.on('crm_event', listener);

  // Keep connection alive with pings every 30s
  const keepAlive = setInterval(() => {
    res.write(':\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    crmEventBus.off('crm_event', listener);
  });
});

export const eventsRoutes = router;
