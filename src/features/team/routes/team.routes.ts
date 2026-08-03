import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { listTeamMembers, createTeamMember, deleteTeamMember, TeamServiceError, ASSIGNABLE_ROLES } from '../services/team.service.js';

const router = Router();

// Toda a gestão de equipe (criar/excluir usuário, ver a lista) é restrita a ADMIN — é uma
// operação de conta, não de dados comerciais do dia a dia.
router.use(requireRole(['ADMIN']));

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const members = await listTeamMembers((req as AuthRequest).user.organizationId);
        res.json({ success: true, data: { members, assignableRoles: ASSIGNABLE_ROLES } });
    } catch (error) {
        next(error);
    }
});

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { name, email, role } = req.body as { name?: string; email?: string; role?: string };
        if (!name || !email || !role) {
            res.status(400).json({ success: false, error: 'name, email e role são obrigatórios.' });
            return;
        }
        const { member, tempPassword } = await createTeamMember({
            organizationId: (req as AuthRequest).user.organizationId,
            name,
            email,
            role,
        });
        // A senha temporária só existe nesta resposta — nunca é persistida em texto puro nem
        // devolvida de novo depois. O admin precisa copiá-la e repassar agora.
        res.status(201).json({ success: true, data: { member, tempPassword } });
    } catch (error) {
        if (error instanceof TeamServiceError) {
            res.status(error.statusCode).json({ success: false, error: error.message });
            return;
        }
        next(error);
    }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        await deleteTeamMember(authReq.user.organizationId, req.params.id, authReq.user.id);
        res.json({ success: true, message: 'Usuário removido.' });
    } catch (error) {
        if (error instanceof TeamServiceError) {
            res.status(error.statusCode).json({ success: false, error: error.message });
            return;
        }
        next(error);
    }
});

export const teamRoutes = router;
