import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import {
  listTeamMembers,
  listAssignableOwners,
  createTeamMember,
  resetTeamMemberPassword,
  deleteTeamMember,
  unlockTeamMember,
  TeamServiceError,
  ASSIGNABLE_ROLES,
} from '../services/team.service.js';
import { routeParam } from '../../../shared/http/routeParams.js';

const router = Router();

// Só nome/id, sem e-mail nem papel — qualquer usuário da organização pode ver para reatribuir um
// lead/atividade a um colega, mesmo sem ser ADMIN. Precisa vir ANTES do requireRole(['ADMIN'])
// abaixo, que protege o resto da gestão de equipe (criar/excluir usuário, ver a lista completa).
router.get(
  '/assignable',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const owners = await listAssignableOwners((req as AuthRequest).user.organizationId);
      res.json({ success: true, data: { owners } });
    } catch (error) {
      next(error);
    }
  },
);

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

router.post(
  '/:id/reset-password',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthRequest;
      const { member, tempPassword } = await resetTeamMemberPassword(
        authReq.user.organizationId,
        routeParam(req.params.id, 'id'),
      );
      // Mesma regra da criação: a senha só existe nesta resposta, nunca é devolvida de novo.
      res.json({ success: true, data: { member, tempPassword } });
    } catch (error) {
      if (error instanceof TeamServiceError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  },
);

router.post(
  '/:id/unlock',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthRequest;
      const member = await unlockTeamMember(authReq.user.organizationId, routeParam(req.params.id, 'id'));
      res.json({ success: true, data: { member } });
    } catch (error) {
      if (error instanceof TeamServiceError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  },
);

router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    await deleteTeamMember(authReq.user.organizationId, routeParam(req.params.id, 'id'), authReq.user.id);
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
