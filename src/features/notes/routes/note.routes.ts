import { Router } from 'express';

import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { noteSchema } from '../../../lib/zod.js';
import { container } from '../../../shared/di/container.js';
import { NoteController } from '../presentation/NoteController.js';

const router = Router({ mergeParams: true }); // mergeParams to access :leadId from parent router

router.get('/', (req, res, next) => container.resolve<NoteController>('NoteController').getNotesByLead(req, res, next));

router.post('/', requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']), validateRequest(noteSchema), (req, res, next) =>
    container.resolve<NoteController>('NoteController').createNote(req, res, next));

router.delete('/:noteId', requireRole(['ADMIN', 'GESTOR']), (req, res, next) =>
    container.resolve<NoteController>('NoteController').deleteNote(req, res, next));

export const noteRoutes = router;
