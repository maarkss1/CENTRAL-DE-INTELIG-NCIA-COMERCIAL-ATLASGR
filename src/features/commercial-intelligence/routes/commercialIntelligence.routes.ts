import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { container } from '../../../shared/di/container.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { COMMERCIAL_INTELLIGENCE_ROLES } from '../../../lib/auth/authorization.js';
import { env } from '../../../config/env.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { CommercialIntelligenceController } from '../presentation/CommercialIntelligenceController.js';

const router = Router();

// Camada de autorização própria da rota (além de `authenticateToken`/`requireTenant` já
// aplicados no mount de `server.ts`, igual a todo outro módulo). Isto é DEFESA EM PROFUNDIDADE
// deliberada, não redundância acidental: mesmo que o mount em `server.ts` mude no futuro, este
// router nunca serve o módulo restrito sem re-checar o papel aqui — nenhum sub-endpoint escapa
// por engano. Mesmo padrão de `managementRoles`/`writeRoles` em crm360.routes.ts.
router.use(requireRole([...COMMERCIAL_INTELLIGENCE_ROLES]));

// Limitador dedicado (mesmo desenho SEC-008b do `aiLimiter` em server.ts: por organizationId, não
// por IP) só para os 2 endpoints que chamam o gateway de IA — aplicado por rota, não no router
// inteiro, porque as demais rotas deste módulo são leitura pura de banco e a UI já faz várias
// chamadas por troca de aba; colocar o limite de IA (bem mais baixo) no router inteiro derrubaria
// a navegação normal do cockpit bem antes de qualquer chamada de IA de verdade.
const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.AI_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as AuthRequest).user?.organizationId || ipKeyGenerator(req.ip || 'unknown'),
    message: { success: false, error: 'Muitas chamadas de IA para esta organização — tente novamente em alguns minutos.' },
});

function resolve(): CommercialIntelligenceController {
    return container.resolve<CommercialIntelligenceController>('CommercialIntelligenceController');
}

router.get('/overview', (req, res, next) => resolve().getOverview(req, res, next));
router.get('/pipeline-creation', (req, res, next) => resolve().getPipelineCreation(req, res, next));
router.get('/performance', (req, res, next) => resolve().getPerformance(req, res, next));
router.get('/aging', (req, res, next) => resolve().getAging(req, res, next));
router.get('/losses', (req, res, next) => resolve().getLosses(req, res, next));
router.get('/leading-indicators', (req, res, next) => resolve().getLeadingIndicators(req, res, next));
router.get('/alerts', (req, res, next) => resolve().getAlerts(req, res, next));
router.get('/crm-quality', (req, res, next) => resolve().getCrmQuality(req, res, next));
router.get('/deals', (req, res, next) => resolve().getDeals(req, res, next));
router.get('/deals/:leadId/forecast', (req, res, next) => resolve().getForecastExplain(req, res, next));
router.get('/metrics-dictionary', (req, res) => resolve().getMetricsDictionary(req, res));
router.get('/filter-options', (req, res, next) => resolve().getFilterOptions(req, res, next));
router.get('/trends', (req, res, next) => resolve().getHistoricalTrends(req, res, next));
router.get('/goals', (req, res, next) => resolve().getGoal(req, res, next));
// PUT (não POST) de propósito: idempotente por (organizationId, period, metric) — upsert, não
// criação de um novo registro a cada chamada. Só ADMIN/GESTOR (mesmo requireRole do router
// inteiro) pode definir a meta — nunca inferida/fabricada pelo sistema.
router.put('/goals', (req, res, next) => resolve().putGoal(req, res, next));

// POST (não GET) de propósito: dispara uma chamada de IA de verdade (custo, latência, efeito
// colateral de notificação em caso crítico) — não é uma leitura idempotente sem custo como as
// rotas GET acima.
router.post('/ai/executive-summary', aiLimiter, (req, res, next) => resolve().postAiExecutiveSummary(req, res, next));
router.post('/ai/bitrix-note', aiLimiter, (req, res, next) => resolve().postAiBitrixNote(req, res, next));

export const commercialIntelligenceRoutes = router;
