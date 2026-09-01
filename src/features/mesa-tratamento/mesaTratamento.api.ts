import { api } from '../../lib/api';

export type LeadOutcome =
  | 'contato'
  | 'reuniao_agendada'
  | 'reuniao_realizada'
  | 'retorno'
  | 'convertido'
  | 'sem_fit'
  | 'dados_invalidos'
  | 'revisao';

export interface QueueLeadSummary {
  id: string;
  title: string;
  status: string;
  temperature: string | null;
  daysSinceTouch: number | null;
  owner: string | null;
}

/** Subconjunto de `LeadQualification` (`src/types/index.ts`) mais relevante pra decidir o que
 *  fazer agora numa call — não o checklist inteiro (~20 campos), que já tem tela própria de
 *  edição em outro lugar do CRM. */
export interface QueueLeadQualificationSnapshot {
  dorPrincipal?: string;
  detalhamentoDor?: string;
  solucaoAtlas?: string;
  nivelAutoridade?: string;
  interessePercebido?: string;
  horizonteDecisao?: string;
  temaProximaReuniao?: string;
}

export interface QueueLeadDetail extends QueueLeadSummary {
  segment: string | null;
  contactName: string | null;
  contactRole: string | null;
  phone: string | null;
  email: string | null;
  score: number | null;
  bitrixStageLabel: string | null;
  nextAction: string | null;
  qualification: QueueLeadQualificationSnapshot | null;
}

export interface BitrixLeadStageOption {
  id: string;
  name: string;
}

export interface MesaQueueResponse {
  queue: QueueLeadSummary[];
  current: QueueLeadDetail | null;
  connectionId: string | null;
  leadStatuses: BitrixLeadStageOption[];
}

export interface RegisterLeadInput {
  outcome: LeadOutcome;
  note: string;
  bitrixStatusId?: string;
  lossReasonId?: string;
  nextActionTitle?: string;
  nextActionWhen?: string;
}

export const mesaTratamentoApi = {
  queue: () => api.get<MesaQueueResponse>('/api/mesa-tratamento/queue'),
  register: (leadId: string, input: RegisterLeadInput) =>
    api.post<{ registered: boolean }>(`/api/mesa-tratamento/lead/${leadId}/register`, input),
};

export const OUTCOME_LABELS: Record<LeadOutcome, string> = {
  contato: 'Contato realizado • manter cadência',
  reuniao_agendada: 'Reunião agendada',
  reuniao_realizada: 'Reunião realizada',
  retorno: 'Cliente pediu retorno futuro',
  convertido: 'Avançou para oportunidade',
  sem_fit: 'Sem aderência/recusou • desqualificar',
  dados_invalidos: 'Dados inválidos • desqualificar',
  revisao: 'Enviar para revisão da gestão',
};

export function isDisqualifyOutcome(outcome: LeadOutcome | ''): boolean {
  return outcome === 'sem_fit' || outcome === 'dados_invalidos';
}
