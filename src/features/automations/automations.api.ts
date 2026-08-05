import { api } from '../../lib/api';

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

/** Etapas dos dois funis (Lead + Negócio), para o filtro de condição do gatilho de status. */
export const LEAD_STATUSES = [
    'Lead Recebido', 'Cadência Iniciada', 'Qualificação (SDR)', 'Reunião Agendada',
    'Convertido em Oportunidade', 'Lead Desqualificado',
    'Nova Oportunidade', 'Proposta Enviada', 'Call/Visita Agendada', 'Piloto VTECH',
    'Piloto Atlas Profile', 'Piloto Atlas Profile - Concluído', 'Piloto Atlas Profile - Cancelado',
    'Piloto Logística', 'Piloto Logístico - Concluído', 'Piloto Logístico - Cancelado',
    'Negócios Ganhos', 'Negócios Perdidos',
];

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
