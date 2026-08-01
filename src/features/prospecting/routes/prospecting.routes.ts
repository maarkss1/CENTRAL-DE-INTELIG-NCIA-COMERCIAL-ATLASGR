import { Router, Request, Response, NextFunction } from 'express';

import { discoverCandidates, promoteToCrm, discoverDecisionMakers } from '../services/prospecting.service.js';
import { checkApolloConnection } from '../services/apollo.service.js';
import { fetchCnpjData } from '../services/enrichment.service.js';
import { normalizeCompanyDomain } from '../utils/domain.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';

const router = Router();

// Revalida o login técnico da Apollo por API key sem consumir créditos.
router.post('/apollo/reconnect', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const status = await checkApolloConnection();
        res.json({ success: true, data: status });
    } catch (error) {
        next(error);
    }
});

// Descoberta de candidatos via IA a partir de um ICP (Perfil de Cliente Ideal).
router.post('/discover', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const criteria = req.body as import("../services/prospecting.service.js").ProspectCriteria;
        if (!criteria || typeof criteria !== 'object') {
            res.status(400).json({ success: false, error: 'Critérios de busca inválidos' });
            return;
        }
        const result = await discoverCandidates(criteria);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// Consulta em tempo real (sem persistir) de um CNPJ na Receita Federal via BrasilAPI.
router.post('/enrich-cnpj', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { cnpj } = req.body as { cnpj?: string };
        if (!cnpj || typeof cnpj !== 'string') {
            res.status(400).json({ success: false, error: 'CNPJ é obrigatório' });
            return;
        }
        const result = await fetchCnpjData(cnpj);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// Promove um candidato (IA ou CNPJ) para o CRM: cria Company + Contact + Lead e enriquece automaticamente.
router.post('/promote', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const body = req.body as { tradeName?: string; source?: string };
        if (!body.tradeName || !body.source) {
            res.status(400).json({ success: false, error: 'tradeName e source são obrigatórios' });
            return;
        }
        const { organizationId } = (req as AuthRequest).user;
        const result = await promoteToCrm({ ...req.body, organizationId });
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// Busca de decisores para uma empresa específica
router.post('/decision-makers', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { domain, criteria } = req.body as { domain?: string; criteria?: Record<string, unknown> };
        const normalizedDomain = typeof domain === 'string' ? normalizeCompanyDomain(domain) : '';
        if (!normalizedDomain) {
            res.status(400).json({ success: false, error: 'Informe um domínio válido da empresa' });
            return;
        }
        const result = await discoverDecisionMakers(normalizedDomain, criteria ?? {});
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

export const prospectingRoutes = router;
