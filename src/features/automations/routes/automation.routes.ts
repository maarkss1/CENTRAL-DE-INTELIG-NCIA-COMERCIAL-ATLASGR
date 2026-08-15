import { Router } from 'express';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { automationSchema } from '../application/AutomationUseCases.js';
import { container } from '../../../shared/di/container.js';
import { AutomationController } from '../presentation/AutomationController.js';
import { runStagnationScan } from '../application/stagnation-scanner.service.js';
import { logger } from '../../../lib/logger.js';

const router = Router();
// Regras de automação afetam o comportamento comercial de toda a organização — tratado como
// configuração administrativa (ADMIN/GESTOR), não como escrita comum de CRM.
const managementRoles = requireRole(['ADMIN', 'GESTOR']);

/** Opções que a tela usa para montar os selects, para o frontend não duplicar os enums. */
router.get('/options', (req, res) => container.resolve<AutomationController>('AutomationController').getOptions(req, res));

router.get('/', (req, res, next) => container.resolve<AutomationController>('AutomationController').getAutomations(req, res, next));

router.post('/', managementRoles, validateRequest(automationSchema), (req, res, next) => container.resolve<AutomationController>('AutomationController').createAutomation(req, res, next));

router.put('/:id', managementRoles, validateRequest(automationSchema.partial()), (req, res, next) => container.resolve<AutomationController>('AutomationController').updateAutomation(req, res, next));

router.delete('/:id', managementRoles, (req, res, next) => container.resolve<AutomationController>('AutomationController').deleteAutomation(req, res, next));

// Dispara a varredura de estagnação (regras "Lead mudou de status" com condição
// `daysSinceLastInteraction`, ver stagnation-scanner.service.ts) imediatamente em vez de esperar o
// cron diário. Roda para TODAS as organizações (mesmo padrão de `runColdLeadsScan`/`/win-loss-
// analysis`), então fica restrito a ADMIN — não é uma leitura escopada ao tenant de quem chama.
router.post('/stagnation-scan', requireRole(['ADMIN']), async (req, res, next) => {
    try {
        const result = await runStagnationScan();
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error({ err: error }, 'Falha ao disparar a varredura de estagnação manualmente');
        next(error);
    }
});

export const automationRoutes = router;
