import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { prisma } from '../../../lib/prisma.js';
import { sellerPerformanceAggregator } from '../services/sellerPerformanceAggregator.service.js';
import { aiSuite } from '../../intelligence/services/CentralAISuiteService.js';
import type { SellerPerformanceData } from '../services/seller-coaching.service.js';

const router = Router();

const VALID_ROLES: Array<NonNullable<SellerPerformanceData['role']>> = [
  'SDR / Hunter',
  'Closer / Executivo de Contas',
  'Account Manager / Farmer',
];

function isValidRole(value: unknown): value is NonNullable<SellerPerformanceData['role']> {
  return typeof value === 'string' && (VALID_ROLES as string[]).includes(value);
}

function currentWeekRange(): { from: Date; to: Date } {
  const now = new Date();
  const diffToMonday = (now.getDay() + 6) % 7; // domingo=0 vira 6 dias desde a última segunda
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from, to };
}

function formatWeekLabel(period: { from: Date; to: Date }): string {
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  return `${fmt(period.from)} – ${fmt(new Date(period.to.getTime() - 1))}`;
}

/**
 * POST /api/gamification/coaching/weekly — coaching semanal gerado por IA a partir de dados reais
 * de atividades e negócios do próprio vendedor autenticado (Piloto 007, .claude/PILOTS.md). O nome
 * usado para escopar `Activity.owner`/`Lead.owner` vem sempre do usuário autenticado (nunca do
 * body) — cada vendedor só pode gerar o próprio coaching.
 */
router.post('/coaching/weekly', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { organizationId, id: userId } = (req as AuthRequest).user;
    const requestedRole = (req.body as { role?: unknown } | undefined)?.role;
    const role = isValidRole(requestedRole) ? requestedRole : undefined;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    if (!user) {
      res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
      return;
    }

    const period = currentWeekRange();
    const performance = await sellerPerformanceAggregator.compute(
      organizationId,
      user.name,
      period,
    );
    const periodLabel = formatWeekLabel(period);

    const report = await aiSuite.sellerCoaching.generateCoachingReport({
      sellerName: user.name,
      period: periodLabel,
      role,
      ...performance,
    });

    res.json({ success: true, data: { report, performance, period: periodLabel } });
  } catch (error) {
    next(error);
  }
});

export const gamificationRoutes = router;
