import { z } from 'zod';
import { Automation, AutomationRepository } from '../domain/Automation';
import { BaseUseCases } from '../../../shared/application/BaseUseCases';
import { automationVersioningService, type AutomationVersionActor, type AutomationVersionTimeline } from '../automation-versioning.service.js';
import { dryRunAutomation, type DryRunOptions, type DryRunResult } from '../automation-dry-run.service.js';

export const AUTOMATION_TRIGGERS = ['Lead criado', 'Lead mudou de status', 'Atividade concluída'] as const;
export const AUTOMATION_ACTIONS = ['Notificar equipe', 'Criar atividade', 'Ligar via SDR de Voz'] as const;

/**
 * Operador numérico de condição (ver `matchesConditions` em `automation.engine.ts`) — usado pelas
 * regras de estagnação disparadas por `stagnation-scanner.service.ts` (ex.: "Negócio parado há X
 * dias", "Proposta enviada sem resposta"). `.strict()` garante exatamente uma das quatro chaves,
 * nunca um objeto arbitrário indo parar como condição.
 */
const conditionOperatorSchema = z.union([
    z.object({ gte: z.number() }).strict(),
    z.object({ lte: z.number() }).strict(),
    z.object({ gt: z.number() }).strict(),
    z.object({ lt: z.number() }).strict(),
]);

export const automationSchema = z.object({
    name: z.string().trim().min(1, 'Dê um nome à automação').max(120),
    enabled: z.boolean().optional(),
    trigger: z.enum(AUTOMATION_TRIGGERS),
    /** Igualdade simples (string) ou operador numérico (`{ gte: 3 }`); `{}` ou ausente = sem filtro. */
    conditions: z.record(z.string(), z.union([z.string(), conditionOperatorSchema])).nullable().optional(),
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

    /** Atualização parcial restrita ao tenant — mesmo contrato do AutomationService original: null
     *  quando o id não pertence a esta organização (a rota devolve 404). `actor` (quem está
     *  editando) alimenta o histórico de versões (Onda 42) — o estado ANTERIOR à edição vira uma
     *  versão histórica antes de ser sobrescrito. Nunca bloqueia a edição se o registro de versão
     *  falhar (ver `automationVersioningService.recordPriorState`). */
    async updateAutomation(organizationId: string, id: string, input: Partial<AutomationInput>, actor?: AutomationVersionActor) {
        const existing = await this.repository.findById!(organizationId, id);
        if (!existing) return null;
        await automationVersioningService.recordPriorState(organizationId, id, existing, actor ?? { userId: null, email: null }, 'update');
        return this.update(organizationId, id, input);
    }

    /** Remoção restrita ao tenant — mesmo contrato do AutomationService original: false quando o id
     *  não pertence a esta organização (a rota devolve 404). O último estado da regra vira uma
     *  versão histórica (`changeReason: 'delete'`) antes de ser removida, para o histórico não
     *  desaparecer junto com a automação. */
    async removeAutomation(organizationId: string, id: string, actor?: AutomationVersionActor): Promise<boolean> {
        const existing = await this.repository.findById!(organizationId, id);
        if (!existing) return false;
        await automationVersioningService.recordPriorState(organizationId, id, existing, actor ?? { userId: null, email: null }, 'delete');
        await this.delete(organizationId, id);
        return true;
    }

    /** Histórico de versões da regra (estado atual + edições anteriores com diff textual) — null
     *  quando o id não pertence a esta organização (a rota devolve 404). */
    async listVersions(organizationId: string, id: string): Promise<AutomationVersionTimeline | null> {
        const automation = await this.repository.findById!(organizationId, id);
        if (!automation) return null;
        return automationVersioningService.buildTimeline(organizationId, automation);
    }

    /** Simulação ("dry-run") da regra contra o dado atual da organização — ver
     *  `automation-dry-run.service.ts` para a metodologia. Null quando o id não pertence a esta
     *  organização (a rota devolve 404). */
    async dryRun(organizationId: string, id: string, options?: DryRunOptions): Promise<DryRunResult | null> {
        const automation = await this.repository.findById!(organizationId, id);
        if (!automation) return null;
        return dryRunAutomation(organizationId, automation, options);
    }
}
