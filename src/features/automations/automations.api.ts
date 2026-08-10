import { api } from '../../lib/api';
import { LEAD_STATUS } from '../../lib/zod';

export type AutomationTrigger = 'Lead criado' | 'Lead mudou de status' | 'Atividade concluída';
export type AutomationAction = 'Notificar equipe' | 'Criar atividade' | 'Ligar via SDR de Voz';

export interface Automation {
    id: string;
    name: string;
    enabled: boolean;
    trigger: AutomationTrigger;
    conditions: Record<string, string> | null;
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
    conditions?: Record<string, string> | null;
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

/** Frase legível do que a regra faz, montada a partir do gatilho, condição e ação. */
export function describeAutomation(a: Automation): string {
    const condicoes = a.conditions ? Object.entries(a.conditions).filter(([, v]) => v) : [];
    const filtro = condicoes.length > 0
        ? ` (${condicoes.map(([k, v]) => `${k} = ${v}`).join(', ')})`
        : '';
    return `Quando "${a.trigger}"${filtro} → ${a.action}`;
}
