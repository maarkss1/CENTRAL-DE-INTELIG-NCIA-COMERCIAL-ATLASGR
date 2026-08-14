import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../shared/middlewares/requireRole.js';
import { lgpdService } from './lgpd.service.js';

export const lgpdRouter = Router();

// Exclusão / Anonimização de Titular (LGPD Art. 18) — irreversível, por isso exige um papel
// mínimo (ADMIN/GESTOR), mesmo padrão de src/features/commercial-intelligence/routes/
// commercialIntelligence.routes.ts. Este router é montado em server.ts com
// `authenticateToken, requireTenant`, então `req.user` sempre existe aqui.
lgpdRouter.delete('/titular/:contactId', requireRole(['ADMIN', 'GESTOR']), (req: Request, res: Response, next: NextFunction): void => {
    (async () => {
        // organizationId vem exclusivamente do usuário autenticado (req.user, populado por
        // authenticateToken a partir da sessão) — nunca de um header controlado pelo cliente.
        // Um fallback para `x-organization-id` aqui permitiria que qualquer requisição forjasse
        // esse header e apagasse/anonimizasse dados de OUTRO tenant.
        const { organizationId } = (req as AuthRequest).user;
        const { contactId } = req.params;
        const result = await lgpdService.eraseContact(organizationId, contactId);

        res.json({
            message: 'Dados do titular anonimizados com sucesso.',
            result
        });
    })().catch(next);
});

// Exportação / Portabilidade de Titular (LGPD Art. 18 V)
lgpdRouter.get('/titular/:contactId/export', (req: Request, res: Response, next: NextFunction): void => {
    (async () => {
        // Mesmo raciocínio da rota de exclusão acima: organizationId só do usuário autenticado.
        const { organizationId } = (req as AuthRequest).user;
        const { contactId } = req.params;
        const data = await lgpdService.exportContactData(organizationId, contactId);

        res.json(data);
    })().catch(next);
});
