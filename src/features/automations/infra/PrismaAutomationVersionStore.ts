/**
 * Implementação real (Prisma/Postgres) de `AutomationVersionStore` — o model `AutomationVersion`
 * existe desde a migration `20260827210000_onda42_decisoes_schema` (ver
 * `.agents/handoffs/onda-42/07-para-00-automation-versioning.md`, agora resolvido). Substitui
 * `InMemoryAutomationVersionStore` (protótipo, dados somem a cada reinício) em produção.
 *
 * `trigger`/`action` no domínio (`AutomationVersionSnapshot`) usam o mesmo label legível já usado
 * por `Automation` (ex.: "Lead criado") — convertidos para/de a chave do enum Prisma (ex.:
 * "Lead_Criado") via os mesmos helpers já usados pelo resto do módulo de automações
 * (`src/lib/enumMap.ts`), para não duplicar essa tabela de conversão aqui.
 */
import type { AutomationVersionInput, AutomationVersionRecord, AutomationVersionStore } from '../domain/AutomationVersion';
import { prisma } from '../../../lib/prisma.js';
import {
    fromPrismaAutomationAction,
    fromPrismaAutomationTrigger,
    toPrismaAutomationAction,
    toPrismaAutomationTrigger,
} from '../../../lib/enumMap.js';
import type { Prisma } from '@prisma/client';

function toRecord(row: {
    id: string;
    automationId: string;
    organizationId: string;
    name: string;
    enabled: boolean;
    trigger: string;
    conditions: unknown;
    action: string;
    actionConfig: unknown;
    editedByUserId: string | null;
    editedByEmail: string | null;
    changeReason: string;
    createdAt: Date;
}): AutomationVersionRecord {
    return {
        id: row.id,
        automationId: row.automationId,
        organizationId: row.organizationId,
        name: row.name,
        enabled: row.enabled,
        trigger: fromPrismaAutomationTrigger(row.trigger),
        conditions: row.conditions,
        action: fromPrismaAutomationAction(row.action),
        actionConfig: row.actionConfig,
        editedByUserId: row.editedByUserId,
        editedByEmail: row.editedByEmail,
        changeReason: row.changeReason === 'delete' ? 'delete' : 'update',
        createdAt: row.createdAt,
    };
}

export class PrismaAutomationVersionStore implements AutomationVersionStore {
    async record(input: AutomationVersionInput): Promise<void> {
        // Append-only — nunca sobrescreve um snapshot existente (sem @default(cuid()) usado
        // deliberadamente aqui: cada chamada é sempre um create novo).
        await prisma.automationVersion.create({
            data: {
                automationId: input.automationId,
                organizationId: input.organizationId,
                name: input.name,
                enabled: input.enabled,
                trigger: toPrismaAutomationTrigger(input.trigger) as Prisma.AutomationVersionCreateInput['trigger'],
                conditions: (input.conditions ?? undefined) as Prisma.InputJsonValue | undefined,
                action: toPrismaAutomationAction(input.action) as Prisma.AutomationVersionCreateInput['action'],
                actionConfig: input.actionConfig as Prisma.InputJsonValue,
                editedByUserId: input.editedByUserId,
                editedByEmail: input.editedByEmail,
                changeReason: input.changeReason,
            },
        });
    }

    async listByAutomation(organizationId: string, automationId: string, limit = 100): Promise<AutomationVersionRecord[]> {
        const rows = await prisma.automationVersion.findMany({
            where: { organizationId, automationId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        return rows.map(toRecord);
    }
}
