import { api } from '../../lib/api';
import { LEAD_STATUS } from '../../lib/zod';

export type AutomationTrigger = 'Lead criado' | 'Lead mudou de status' | 'Atividade concluída' | 'Lead sem interação';
export type AutomationAction = 'Notificar equipe' | 'Criar atividade' | 'Ligar via SDR de Voz';

/**
 * Operador numérico de condição (ver `matchesConditions` em `automation.engine.ts`), usado pelas
 * regras de estagnação reavaliadas periodicamente por `stagnation-scanner.service.ts` (ex.:
 * "Negócio parado há X dias") — nunca colide com uma condição de igualdade legada (sempre string).
 */
export type AutomationConditionOperator = { gte: number } | { lte: number } | { gt: number } | { lt: number };
export type AutomationConditions = Record<string, string | AutomationConditionOperator>;

export interface Automation {
    id: string;
    name: string;
    enabled: boolean;
    trigger: AutomationTrigger;
    conditions: AutomationConditions | null;
    action: AutomationAction;
    actionConfig: Record<string, unknown>;
    lastRunAt: string | null;
    runCount: number;
    createdAt: string;
}

export interface AutomationDraft {
    name: string;
    trigger: AutomationTrigger;
    action: AutomationAction;
    conditions?: AutomationConditions | null;
    actionConfig?: Record<string, unknown>;
    enabled?: boolean;
}

export const TRIGGERS: AutomationTrigger[] = ['Lead criado', 'Lead mudou de status', 'Atividade concluída'];
export const ACTIONS: AutomationAction[] = ['Notificar equipe', 'Criar atividade', 'Ligar via SDR de Voz'];

/** Etapas do funil, para o filtro de condição do gatilho de status — lista completa dos 18
 * estágios (LEAD_STATUS, fonte única em lib/zod.ts), incluindo os 7 estágios "Piloto" do funil
 * Negócio que antes ficavam de fora deste filtro mesmo já sendo estágios válidos de lead. */
export const LEAD_STATUSES: string[] = [...LEAD_STATUS];

export const automationsApi = {
    list: () => api.get<Automation[]>('/api/automations'),
    create: (draft: AutomationDraft) => api.post<Automation>('/api/automations', draft),
    update: (id: string, patch: Partial<AutomationDraft>) => api.put<Automation>(`/api/automations/${id}`, patch),
    remove: (id: string) => api.delete<void>(`/api/automations/${id}`),
};

const OPERATOR_SYMBOL: Record<keyof AutomationConditionOperator, string> = { gte: '≥', lte: '≤', gt: '>', lt: '<' } as never;

function isOperatorValue(v: unknown): v is AutomationConditionOperator {
    return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** Frase legível do que a regra faz, montada a partir do gatilho, condição e ação. */
export function describeAutomation(a: Automation): string {
    const condicoes = a.conditions ? Object.entries(a.conditions).filter(([, v]) => v != null && v !== '') : [];
    const filtro = condicoes.length > 0
        ? ` (${condicoes.map(([k, v]) => {
            if (isOperatorValue(v)) {
                const [operator, threshold] = Object.entries(v)[0] as [keyof AutomationConditionOperator, number];
                return `${k} ${OPERATOR_SYMBOL[operator] ?? operator} ${threshold}`;
            }
            return `${k} = ${v}`;
        }).join(', ')})`
        : '';
    return `Quando "${a.trigger}"${filtro} → ${a.action}`;
}

