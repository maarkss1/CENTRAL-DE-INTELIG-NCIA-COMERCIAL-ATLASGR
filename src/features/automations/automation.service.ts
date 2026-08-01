import { prisma } from '../../lib/prisma.js';
import { z } from 'zod';

export const AUTOMATION_TRIGGERS = ['Lead criado', 'Lead mudou de status', 'Atividade concluída'] as const;
export const AUTOMATION_ACTIONS = ['Notificar equipe', 'Criar atividade'] as const;

export const automationSchema = z.object({
    name: z.string().trim().min(1, 'Dê um nome à automação').max(120),
    enabled: z.boolean().optional(),
    trigger: z.enum(AUTOMATION_TRIGGERS),
    /** Igualdades simples; `{}` ou ausente = sem filtro. */
    conditions: z.record(z.string(), z.string()).nullable().optional(),
    action: z.enum(AUTOMATION_ACTIONS),
    actionConfig: z.record(z.string(), z.unknown()).default({}),
});

export type AutomationInput = z.infer<typeof automationSchema>;

export class AutomationService {
    async list(organizationId: string) {
        return prisma.automation.findMany({
            where: { organizationId },
            orderBy: [{ enabled: 'desc' }, { createdAt: 'desc' }],
        });
    }

    async create(organizationId: string, input: AutomationInput) {
        return prisma.automation.create({
            data: {
                organizationId,
                name: input.name,
                enabled: input.enabled ?? true,
                trigger: input.trigger as never,
                conditions: input.conditions ?? undefined,
                action: input.action as never,
                actionConfig: (input.actionConfig ?? {}) as never,
            },
        });
    }

    /** Atualização parcial restrita ao tenant — um id de outra organização não altera nada. */
    async update(organizationId: string, id: string, input: Partial<AutomationInput>) {
        const existing = await prisma.automation.findFirst({ where: { id, organizationId } });
        if (!existing) return null;

        return prisma.automation.update({
            where: { id },
            data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
                ...(input.trigger !== undefined ? { trigger: input.trigger as never } : {}),
                ...(input.conditions !== undefined ? { conditions: input.conditions ?? undefined } : {}),
                ...(input.action !== undefined ? { action: input.action as never } : {}),
                ...(input.actionConfig !== undefined ? { actionConfig: input.actionConfig as never } : {}),
            },
        });
    }

    async remove(organizationId: string, id: string): Promise<boolean> {
        const { count } = await prisma.automation.deleteMany({ where: { id, organizationId } });
        return count > 0;
    }
}

export const automationService = new AutomationService();
