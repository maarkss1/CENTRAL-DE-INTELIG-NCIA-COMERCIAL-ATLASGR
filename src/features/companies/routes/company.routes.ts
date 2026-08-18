import { Router } from 'express';

import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { companySchema } from '../../../lib/zod.js';
import { container } from '../../../shared/di/container';
import { CompanyController } from '../presentation/CompanyController';
import { marketIntelligenceCompanyRoutes } from '../../market-intelligence/server/marketIntelligenceCompany.routes.js';

const router = Router();
const writeRoles = requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);

router.get('/', (req, res, next) => container.resolve<CompanyController>('CompanyController').getCompanies(req, res, next));

// Catálogo empresarial oficial separado do CRM Company. O mount fica antes de /:id para que
// "market-intelligence" nunca seja interpretado como id de uma conta do CRM. A entidade consultada
// é MarketIntelligenceCompany e nenhuma leitura cria/promove uma Company automaticamente.
router.use('/market-intelligence', marketIntelligenceCompanyRoutes);

router.get('/:id', (req, res, next) => container.resolve<CompanyController>('CompanyController').getCompanyById(req, res, next));
router.post('/', writeRoles, validateRequest(companySchema), (req, res, next) => container.resolve<CompanyController>('CompanyController').createCompany(req, res, next));
router.put('/:id', writeRoles, validateRequest(companySchema.partial()), (req, res, next) => container.resolve<CompanyController>('CompanyController').updateCompany(req, res, next));

// Apenas ADMIN e GESTOR podem deletar empresas
router.delete('/:id', requireRole(['ADMIN', 'GESTOR']), (req, res, next) => container.resolve<CompanyController>('CompanyController').deleteCompany(req, res, next));

// Re-enriquece uma empresa já existente no CRM (Receita Federal + heurísticas de domínio/e-mail).
router.post('/:id/enrich', writeRoles, (req, res, next) => container.resolve<CompanyController>('CompanyController').enrichCompany(req, res, next));

export const companyRoutes = router;
