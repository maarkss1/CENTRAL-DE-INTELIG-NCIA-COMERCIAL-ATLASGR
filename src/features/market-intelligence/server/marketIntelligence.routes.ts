import { Router } from 'express';
import { marketIntelligenceService } from './marketIntelligence.service.js';
import { economicScenarioRoutes } from './economicScenario.routes.js';
import {
    companyCnpjParamsSchema,
    companyListQuerySchema,
    rankingsQuerySchema,
    territoriesQuerySchema,
} from './marketIntelligence.schemas.js';

const router = Router();

// Cenários econômicos versionados. O sub-router aplica RBAC ADMIN/GESTOR e o mount global em
// server.ts já garante authenticateToken + requireTenant antes de chegar aqui.
router.use('/economic-scenarios', economicScenarioRoutes);

router.get('/companies', async (req, res, next) => {
    try {
        const query = companyListQuerySchema.parse(req.query);
        res.json({ success: true, data: await marketIntelligenceService.listCompanies(query) });
    } catch (error) { next(error); }
});

router.get('/companies/:cnpj', async (req, res, next) => {
    try {
        const { cnpj } = companyCnpjParamsSchema.parse(req.params);
        res.json({ success: true, data: await marketIntelligenceService.getCompany(cnpj) });
    } catch (error) { next(error); }
});

router.get('/territories', async (req, res, next) => {
    try {
        res.json({ success: true, data: await marketIntelligenceService.territories(territoriesQuerySchema.parse(req.query)) });
    } catch (error) { next(error); }
});

router.get('/rankings', async (req, res, next) => {
    try {
        res.json({ success: true, data: await marketIntelligenceService.rankings(rankingsQuerySchema.parse(req.query)) });
    } catch (error) { next(error); }
});

router.get('/sources', async (_req, res, next) => {
    try {
        res.json({ success: true, data: await marketIntelligenceService.sources() });
    } catch (error) { next(error); }
});

// As rotas /accounts/... (inteligência de conta) vivem em accountIntelligence.routes.ts, montado
// separadamente em server.ts — ver hotfix de reconciliação do schema duplicado de Account
// Intelligence (dois PRs concorrentes deste módulo tinham sido mesclados de forma inconsistente:
// este router chegou a ter uma segunda cópia dessas rotas apontando para um schema Prisma nunca
// migrado; removida aqui em favor da implementação real, com organizationId/RLS e migration
// aplicada).

export const marketIntelligenceRoutes = router;
