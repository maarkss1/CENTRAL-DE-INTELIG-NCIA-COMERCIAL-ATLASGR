import { Router } from 'express';
import { prisma } from '../../../lib/prisma.js';
import { z } from 'zod';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';

export const promptRoutes = Router();

// Listar todos os prompts
promptRoutes.get('/', async (req, res, next) => {
    try {
        const prompts = await prisma.prompt.findMany({
            orderBy: { category: 'asc' },
        });
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
        variables: z.any().optional(),
    }),
});
promptRoutes.post('/', validateRequest(createPromptSchema), async (req, res, next) => {
    try {
        const { name, category, variables } = req.body;
        const tenantId = (req as unknown as { tenantId?: string }).tenantId || 'system';

        const prompt = await prisma.prompt.create({
            data: {
                name,
                category,
                version: '1.0',
                owner: tenantId,
                variables: variables || {},
                history: [],
                approved: true
            },
        });
        res.status(201).json({ success: true, data: prompt });
    } catch (err) {
        next(err);
    }
});

// Atualizar variáveis de um prompt existente
const updatePromptSchema = z.object({
    params: z.object({
        id: z.string(),
    }),
    body: z.object({
        variables: z.any(),
    }),
});
promptRoutes.put('/:id', validateRequest(updatePromptSchema), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { variables } = req.body;

        const prompt = await prisma.prompt.update({
            where: { id },
            data: { variables },
        });
        res.json({ success: true, data: prompt });
    } catch (err) {
        next(err);
    }
});
