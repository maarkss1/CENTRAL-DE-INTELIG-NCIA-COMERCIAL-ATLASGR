import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';

interface CreatePromptInput {
    name: string;
    category: string;
    variables?: Record<string, unknown>;
}

export async function listPrompts(organizationId: string) {
    return prisma.prompt.findMany({
        where: { organizationId },
        orderBy: { category: 'asc' },
    });
}

export async function createPrompt(organizationId: string, input: CreatePromptInput) {
    return prisma.prompt.create({
        data: {
            name: input.name,
            category: input.category,
            version: '1.0',
            owner: organizationId,
            organizationId,
            variables: (input.variables || {}) as Prisma.InputJsonValue,
            history: [],
            approved: true,
        },
    });
}

// updateMany com organizationId no where garante que só afeta a linha se ela pertencer ao tenant
// do request (proteção de IDOR — ver histórico de prompt.routes.ts antes desta função existir).
export async function updatePromptVariables(organizationId: string, id: string, variables: Record<string, unknown>) {
    const { count } = await prisma.prompt.updateMany({
        where: { id, organizationId },
        data: { variables: variables as Prisma.InputJsonValue },
    });
    if (count === 0) {
        return null;
    }
    return prisma.prompt.findFirst({ where: { id, organizationId } });
}
