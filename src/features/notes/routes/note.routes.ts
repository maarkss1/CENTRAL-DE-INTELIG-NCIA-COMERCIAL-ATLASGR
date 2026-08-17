import { Router, Request, Response, NextFunction } from 'express';

import { noteService } from '../services/note.service.js';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { noteSchema } from '../../../lib/zod.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';

const router = Router({ mergeParams: true }); // mergeParams to access :leadId from parent router

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { leadId } = req.params;
        const notes = await noteService.findByLead(organizationId, leadId);
        res.json({ success: true, data: notes });
    } catch (error) {
        next(error);
    }
});

router.post('/', requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']), validateRequest(noteSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { leadId } = req.params;
        const note = await noteService.create(organizationId, leadId, req.body);
        res.status(201).json({ success: true, data: note });
    } catch (error) {
        next(error);
    }
});

router.delete('/:noteId', requireRole(['ADMIN', 'GESTOR']), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        await noteService.delete(organizationId, req.params.noteId);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

export const noteRoutes = router;
