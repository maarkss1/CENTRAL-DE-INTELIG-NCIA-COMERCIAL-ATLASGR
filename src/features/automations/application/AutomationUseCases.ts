import { z } from 'zod';
import { Automation, AutomationRepository } from '../domain/Automation';
import { BaseUseCases } from '../../../shared/application/BaseUseCases';

export const AUTOMATION_TRIGGERS = ['Lead criado', 'Lead mudou de status', 'Atividade concluída'] as const;
export const AUTOMATION_ACTIONS = ['Notificar equipe', 'Criar atividade', 'Ligar via SDR de Voz'] as const;

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

export class AutomationUseCases extends BaseUseCases<Automation, AutomationRepository> {
    constructor(automationRepository: AutomationRepository) {
        super(automationRepository);
    }

    async listAutomations(organizationId: string) {
        const { data } = await this.findAll(organizationId);
        return data;
    }

    async createAutomation(organizationId: string, input: AutomationInput) {
        const validated = automationSchema.parse(input);
        return this.create(organizationId, validated);
    }

    /** Atualização parcial restrita ao tenant — mesmo contrato do AutomationService original: null quando o id não pertence a esta organização (a rota devolve 404). */
    async updateAutomation(organizationId: string, id: string, input: Partial<AutomationInput>) {
        const existing = await this.repository.findById!(organizationId, id);
        if (!existing) return null;
        return this.update(organizationId, id, input);
    }

    /** Remoção restrita ao tenant — mesmo contrato do AutomationService original: false quando o id não pertence a esta organização (a rota devolve 404). */
    async removeAutomation(organizationId: string, id: string): Promise<boolean> {
        const existing = await this.repository.findById!(organizationId, id);
        if (!existing) return false;
        await this.delete(organizationId, id);
        return true;
    }
}
