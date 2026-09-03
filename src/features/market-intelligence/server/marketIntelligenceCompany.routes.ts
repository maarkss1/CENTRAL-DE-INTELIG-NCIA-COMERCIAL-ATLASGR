import { Router } from 'express';

import {
  CompanyCatalogValidationError,
  approveToPipeline,
  getMarketIntelligenceCompany,
  listMarketIntelligenceCompanies,
  parseCompanyCatalogQuery,
} from './marketIntelligenceCompany.service.js';
import { getAccountIntelligence } from './catalogAccountIntelligence.service.js';
import { routeParam } from '../../../shared/http/routeParams.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const query = parseCompanyCatalogQuery(req.query as Record<string, unknown>);
    const result = await listMarketIntelligenceCompanies(query);
    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof CompanyCatalogValidationError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    next(error);
  }
});

router.get('/:cnpj/intelligence', async (req, res, next) => {
  try {
    const result = await getAccountIntelligence(routeParam(req.params.cnpj, 'cnpj'));
    if (!result.account) {
      res.status(404).json({
        success: false,
        error: result.dataset
          ? 'Empresa não encontrada no snapshot ativo.'
          : 'Nenhum snapshot empresarial ativo foi publicado.',
        dataset: result.dataset,
      });
      return;
    }

    res.json({ success: true, data: result.account, dataset: result.dataset });
  } catch (error) {
    if (error instanceof CompanyCatalogValidationError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    next(error);
  }
});

router.post('/:cnpj/approve-to-pipeline', async (req: any, res, next) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;
    const result = await approveToPipeline(organizationId, routeParam(req.params.cnpj, 'cnpj'), userId);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof CompanyCatalogValidationError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    next(error);
  }
});

router.get('/:cnpj', async (req, res, next) => {
  try {
    const result = await getMarketIntelligenceCompany(routeParam(req.params.cnpj, 'cnpj'));
    if (!result.company) {
      res.status(404).json({
        success: false,
        error: result.dataset
          ? 'Empresa não encontrada no snapshot ativo.'
          : 'Nenhum snapshot empresarial ativo foi publicado.',
        dataset: result.dataset,
      });
      return;
    }
    res.json({ success: true, data: result.company, dataset: result.dataset });
  } catch (error) {
    if (error instanceof CompanyCatalogValidationError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    next(error);
  }
});

export const marketIntelligenceCompanyRoutes = router;
