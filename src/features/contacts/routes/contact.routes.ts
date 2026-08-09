import { Router, Request, Response, NextFunction } from 'express';

import { contactService } from '../services/contact.service.js';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { contactSchema } from '../../../lib/zod.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';

const router = Router();
const writeRoles = requireRole(['ADMIN', 'GESTOR', 'VENDEDOR']);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId: orgId } = (req as AuthRequest).user;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const result = await contactService.findAll(orgId, req.query.q as string | undefined, page, limit);
        res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
        next(error);
    }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId: orgId } = (req as AuthRequest).user;
        const contact = await contactService.findById(orgId, req.params.id);
        if (!contact) {
            res.status(404).json({ success: false, error: 'Contact not found' });
            return;
        }
        res.json({ success: true, data: contact });
    } catch (error) {
        next(error);
    }
});

router.post('/', writeRoles, validateRequest(contactSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId: orgId } = (req as AuthRequest).user;
        const contact = await contactService.create(orgId, req.body);
        res.status(201).json({ success: true, data: contact });
    } catch (error) {
        next(error);
    }
});

router.put('/:id', writeRoles, validateRequest(contactSchema.partial()), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId: orgId } = (req as AuthRequest).user;
        const contact = await contactService.update(orgId, req.params.id, req.body);
        res.json({ success: true, data: contact });
    } catch (error) {
        next(error);
    }
});

// Apenas ADMIN e GESTOR podem deletar contatos
router.delete('/:id', requireRole(['ADMIN', 'GESTOR']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { organizationId: orgId } = (req as AuthRequest).user;
        await contactService.delete(orgId, req.params.id);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

// Enriquece a empresa vinculada ao contato com IA (Receita Federal + Google Negócios + Apollo).
router.post('/:id/enrich', writeRoles, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId: orgId } = (req as AuthRequest).user;
        const result = await contactService.enrich(orgId, req.params.id);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

export const contactRoutes = router;
