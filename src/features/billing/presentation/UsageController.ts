import type { Request, Response, NextFunction } from 'express';
import type { UsageUseCases } from '../application/UsageUseCases.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';

const MIN_DAYS = 7;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;

function parseDays(raw: unknown): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
  return Math.min(Math.max(parsed, MIN_DAYS), MAX_DAYS);
}

export class UsageController {
  constructor(private usageUseCases: UsageUseCases) {}

  /** GET /api/usage?days=30 — consumo de IA da organização. */
  getSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.usageUseCases.summary(organizationId, parseDays(req.query.days));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}
