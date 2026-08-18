import { Router } from 'express';

import {
  CompanyCatalogValidationError,
  getMarketIntelligenceCompany,
  listMarketIntelligenceCompanies,
  parseCompanyCatalogQuery,
} from './marketIntelligenceCompany.service.js';

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

router.get('/:cnpj', async (req, res, next) => {
  try {
    const result = await getMarketIntelligenceCompany(req.params.cnpj);
    if (!result.company) {
      res.status(404).json({
        success: false,
        error: result.dataset ? 'Empresa não encontrada no snapshot ativo.' : 'Nenhum snapshot empresarial ativo foi publicado.',
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
