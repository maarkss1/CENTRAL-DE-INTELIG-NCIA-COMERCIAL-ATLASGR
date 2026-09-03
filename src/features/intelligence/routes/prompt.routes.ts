import { Router } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../../shared/middlewares/requireRole.js';
import { routeParam } from '../../../shared/http/routeParams.js';
import { listPrompts, createPrompt, updatePromptVariables } from '../services/prompt.service.js';

const managementRoles = requireRole(['ADMIN', 'GESTOR']);

export const promptRoutes = Router();

// Listar os prompts do tenant autenticado
promptRoutes.get('/', async (req, res, next) => {
  try {
    const { organizationId } = (req as AuthRequest).user;
    const prompts = await listPrompts(organizationId);
    res.json({ success: true, data: prompts });
  } catch (err) {
    next(err);
  }
});

// Criar novo prompt override
const createPromptSchema = z.object({
  body: z.object({
    name: z.string(),
    category: z.string(),
    variables: z.record(z.string(), z.unknown()).optional(),
  }),
});
promptRoutes.post(
  '/',
  managementRoles,
  validateRequest(createPromptSchema),
  async (req, res, next) => {
    try {
      const { name, category, variables } = req.body;
      // Bug anterior: lia `req.tenantId`, que authenticateToken nunca seta (o middleware expõe
      // `req.user.organizationId`) — todo prompt criado por qualquer tenant caía em owner='system'.
      const { organizationId } = (req as AuthRequest).user;

      const prompt = await createPrompt(organizationId, { name, category, variables });
      res.status(201).json({ success: true, data: prompt });
    } catch (err) {
      next(err);
    }
  },
);

// Atualizar variáveis de um prompt existente
const updatePromptSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
  body: z.object({
    variables: z.record(z.string(), z.unknown()),
  }),
});
promptRoutes.put(
  '/:id',
  managementRoles,
  validateRequest(updatePromptSchema),
  async (req, res, next) => {
    try {
      const id = routeParam(req.params.id, 'id');
      const { variables } = req.body;
      const { organizationId } = (req as AuthRequest).user;

      // Bug anterior: dava update por id sem checar dono — qualquer tenant autenticado podia
      // editar o prompt de outro (IDOR). Ver updatePromptVariables (prompt.service.ts).
      const prompt = await updatePromptVariables(organizationId, id, variables);
      if (!prompt) {
        res.status(404).json({ success: false, error: 'Prompt não encontrado.' });
        return;
      }
      res.json({ success: true, data: prompt });
    } catch (err) {
      next(err);
    }
  },
);
