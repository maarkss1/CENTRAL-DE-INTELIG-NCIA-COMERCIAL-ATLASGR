import { Router } from 'express';
import { actionExecutorService } from './actionExecutor.service.js';
import { accountIntelligenceService } from './accountIntelligence.service.js';
import { marketIntelligenceService } from './marketIntelligence.service.js';
import {
    companyCnpjParamsSchema,
    companyListQuerySchema,
    rankingsQuerySchema,
    territoriesQuerySchema,
} from './marketIntelligence.schemas.js';

const router = Router();

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

router.get('/accounts/:id/intelligence', async (req, res, next) => {
    try {
        res.json({ success: true, data: await accountIntelligenceService.getIntelligence(req.params.id) });
    } catch (error) { next(error); }
});

router.post('/accounts/:id/refresh', async (req, res, next) => {
    try {
        res.json({ success: true, data: await accountIntelligenceService.refreshIntelligence(req.params.id) });
    } catch (error) { next(error); }
});

router.get('/accounts/:id/signals', async (req, res, next) => {
    try {
        res.json({ success: true, data: await accountIntelligenceService.getSignals(req.params.id) });
    } catch (error) { next(error); }
});

router.get('/accounts/:id/decision-makers', async (req, res, next) => {
    try {
        res.json({ success: true, data: await accountIntelligenceService.getDecisionMakers(req.params.id) });
    } catch (error) { next(error); }
});

router.get('/accounts/:id/relationships', async (req, res, next) => {
    try {
        res.json({ success: true, data: await accountIntelligenceService.getRelationships(req.params.id) });
    } catch (error) { next(error); }
});

router.get('/accounts/:id/recommendations', async (req, res, next) => {
    try {
        res.json({ success: true, data: await accountIntelligenceService.getRecommendations(req.params.id) });
    } catch (error) { next(error); }
});

router.get('/accounts/:id/evidence', async (req, res, next) => {
    try {
        res.json({ success: true, data: await accountIntelligenceService.getEvidence(req.params.id) });
    } catch (error) { next(error); }
});

router.post('/accounts/recommendations/:id/execute', async (req, res, next) => {
    try {
        res.json({ success: true, data: await actionExecutorService.executeAction(req.params.id) });
    } catch (error) { next(error); }
});


router.post('/accounts/:id/chat', async (req, res, next) => {
    try {
        const { message } = req.body;
        if (!message) throw new Error('Message is required');
        res.json({ success: true, data: await accountIntelligenceService.chatWithAccount(req.params.id, message) });
    } catch (error) { next(error); }
});

export const marketIntelligenceRoutes = router;

