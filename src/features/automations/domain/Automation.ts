import { Repository } from '../../../shared/domain/Repository';
import type { AutomationTriggerLabel, AutomationActionLabel } from '../../../lib/enumMap';

export interface Automation {
    id: string;
    name: string;
    enabled: boolean;
    /** Label legível (ex: "Lead criado") — o schema.prisma usa identificadores com @map; ver lib/enumMap.ts. */
    trigger: AutomationTriggerLabel;
    conditions: unknown;
    /** Label legível (ex: "Notificar equipe") — ver lib/enumMap.ts. */
    action: AutomationActionLabel;
    actionConfig: unknown;
    lastRunAt: Date | null;
    runCount: number;
    organizationId: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface AutomationRepository extends Repository<Automation> {
    findAllWithFilters(organizationId: string, query?: string, page?: number, limit?: number): Promise<{ data: Automation[], meta: unknown }>;
    findById(organizationId: string, id: string): Promise<Automation | null>;
    create(organizationId: string, data: Partial<Automation>): Promise<Automation>;
    update(organizationId: string, id: string, data: Partial<Automation>): Promise<Automation>;
    delete(organizationId: string, id: string): Promise<Automation>;
}
