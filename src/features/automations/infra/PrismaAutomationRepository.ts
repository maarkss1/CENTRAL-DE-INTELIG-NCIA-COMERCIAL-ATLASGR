import { Automation, AutomationRepository } from '../domain/Automation';
import { prisma } from '../../../lib/prisma.js';
import { Prisma } from '@prisma/client';
import {
    toPrismaAutomationTrigger,
    fromPrismaAutomationTrigger,
    toPrismaAutomationAction,
    fromPrismaAutomationAction,
} from '../../../lib/enumMap.js';

/**
 * schema.prisma usa identificadores de enum (ex: Lead_Criado) com @map para o texto exibido na UI
 * (ex: "Lead criado") — mas o Prisma Client só aceita o identificador na API JS, nunca o valor
 * mapeado (confirmado contra o client gerado: `AutomationTrigger.Lead_Criado === "Lead_Criado"`).
 * Passar o texto humano direto (como o service original fazia via `as never`) sempre falhava em
 * runtime com "Invalid value for argument trigger" — bug real, corrigido aqui na migração.
 */
function serializeAutomation<T extends { trigger: string; action: string }>(automation: T): unknown {
    return {
        ...automation,
        trigger: fromPrismaAutomationTrigger(automation.trigger),
        action: fromPrismaAutomationAction(automation.action),
    };
}

export class PrismaAutomationRepository implements AutomationRepository {
    async findAllWithFilters(organizationId: string): Promise<{ data: Automation[], meta: unknown }> {
        // Sem paginação/filtro de texto hoje (lista sempre foi curta o bastante pra caber numa
        // página só) — mantido idêntico ao AutomationService original, só movido de lugar.
        const data = await prisma.automation.findMany({
            where: { organizationId },
            orderBy: [{ enabled: 'desc' }, { createdAt: 'desc' }],
        });
        const serialized = data.map(serializeAutomation) as unknown as Automation[];
        return { data: serialized, meta: { total: serialized.length, page: 1, limit: serialized.length, totalPages: 1 } };
    }

    async findById(organizationId: string, id: string): Promise<Automation | null> {
        const automation = await prisma.automation.findFirst({ where: { id, organizationId } });
        return automation ? (serializeAutomation(automation) as Automation) : null;
    }

    async create(organizationId: string, data: Partial<Automation>): Promise<Automation> {
        const created = await prisma.automation.create({
            data: {
                organizationId,
                name: data.name!,
                enabled: data.enabled ?? true,
                trigger: toPrismaAutomationTrigger(data.trigger!) as never,
                conditions: (data.conditions ?? undefined) as Prisma.InputJsonValue | undefined,
                action: toPrismaAutomationAction(data.action!) as never,
                actionConfig: (data.actionConfig ?? {}) as Prisma.InputJsonValue,
            },
        });
        return serializeAutomation(created) as Automation;
    }

    async update(organizationId: string, id: string, data: Partial<Automation>): Promise<Automation> {
        const existing = await prisma.automation.findFirst({ where: { id, organizationId } });
        if (!existing) throw new Error('Automation not found');

        const updated = await prisma.automation.update({
            where: { id },
            data: {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
                ...(data.trigger !== undefined ? { trigger: toPrismaAutomationTrigger(data.trigger) as never } : {}),
                ...(data.conditions !== undefined ? { conditions: (data.conditions ?? undefined) as Prisma.InputJsonValue | undefined } : {}),
                ...(data.action !== undefined ? { action: toPrismaAutomationAction(data.action) as never } : {}),
                ...(data.actionConfig !== undefined ? { actionConfig: data.actionConfig as Prisma.InputJsonValue } : {}),
            },
        });
        return serializeAutomation(updated) as Automation;
    }

    async delete(organizationId: string, id: string): Promise<Automation> {
        const existing = await prisma.automation.findFirst({ where: { id, organizationId } });
        if (!existing) throw new Error('Automation not found');
        const deleted = await prisma.automation.delete({ where: { id } });
        return serializeAutomation(deleted) as Automation;
    }
}
