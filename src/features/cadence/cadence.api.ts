import { api } from '../../lib/api';
import type { CadenceJourneyTemplate } from './domain/cadenceTemplates';

/**
 * Cliente HTTP de `/api/cadence/*` (Agente 17, Onda 10) — mesmo padrão de
 * `src/features/analytics/analytics.api.ts`: tipos locais espelhando o shape real da resposta
 * (não os tipos de domínio do backend, `src/features/cadence/domain/cadence.ts`/`optOut.ts` — sobre
 * o arame, datas chegam como string ISO, não `Date`).
 *
 * Criar sequência e iniciar run para um lead adicionados numa rodada anterior. Pausar/retomar/parar
 * um run em andamento (CYC-009, onda 29) adicionados nesta. Encerrar uma SEQUÊNCIA (distinto de
 * parar uma execução) adicionado no Piloto 016 (achado fora de escopo, backend novo).
 */

export type CadenceRunStatus = 'active' | 'paused' | 'stopped' | 'completed' | 'failed';
export type CadenceStopReason =
  | 'opt-out'
  | 'lead-reply'
  | 'completed'
  | 'manual-stop'
  | 'policy-guardrail';
export type CadenceChannel = 'email' | 'whatsapp' | 'voice';
export type CadenceTouchResult = 'sent' | 'failed' | 'skipped';
export type CadenceSkipReason =
  | 'outside-business-window'
  | 'opt-out'
  | 'lead-replied'
  | 'paused'
  | 'contact-rate-limit'
  | 'domain-rate-limit';
export type OptOutScope = CadenceChannel | 'global';
export type OptOutOriginChannel = CadenceChannel | 'manual' | 'import';

export interface OptOutRecordDTO {
  id: string;
  organizationId: string;
  scope: OptOutScope;
  leadId: string | null;
  email: string | null;
  phoneE164: string | null;
  originChannel: OptOutOriginChannel;
  reason: string | null;
  evidence: string | null;
  requestedBy: string | null;
  createdAt: string;
}

export interface CadenceTouchAttemptDTO {
  touchOrder: number;
  attemptNumber: number;
  channel: CadenceChannel;
  attemptedAt: string;
  result: CadenceTouchResult;
  skipReason?: CadenceSkipReason;
  error?: string | null;
  /** Id da mensagem devolvido pelo provedor (WhatsApp/e-mail) quando `result === 'sent'` — já
   * vinha do backend (`domain/cadence.ts::CadenceTouchAttempt.providerMessageId`), mas nunca era
   * tipado nem exibido aqui (achado do Piloto 016). Correlação para suporte/depuração, nem toda
   * tentativa tem um. */
  providerMessageId?: string | null;
}

export interface CadenceRunDTO {
  id: string;
  organizationId: string;
  leadId: string;
  sequenceId: string;
  status: CadenceRunStatus;
  currentTouchOrder: number;
  stopReason: CadenceStopReason | null;
  startedAt: string;
  lastTouchAt: string | null;
  pausedAt: string | null;
  stoppedAt: string | null;
  attempts: CadenceTouchAttemptDTO[];
}

/** A rota aceita status em PascalCase (`Active`/`Paused`/`Stopped`/`Completed`/`Failed`, mesma casing do enum Postgres) — mapeado aqui pra não vazar essa convenção pro resto do frontend. */
const STATUS_TO_QUERY: Record<CadenceRunStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  stopped: 'Stopped',
  completed: 'Completed',
  failed: 'Failed',
};

export interface CadenceTouchInput {
  order: number;
  channel: CadenceChannel;
  delayHoursFromPrevious: number;
  maxAttempts?: number;
  /** Sem sistema de template ainda — este é o conteúdo final da mensagem em si. */
  templateRef?: string;
}

export interface CadenceSequenceDTO {
  id: string;
  organizationId: string;
  name: string;
  /** Coluna real desde sempre no Prisma, nunca aceita pela rota nem preenchível pela UI antes do Piloto 016. */
  description?: string | null;
  touches: CadenceTouchInput[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StartCadenceRunResponse {
  id: string;
  organizationId: string;
  leadId: string;
  sequenceId: string;
  status: CadenceRunStatus;
  currentTouchOrder: number;
  startedAt: string;
  sequenceName: string;
}

export interface ScheduleMeetingResponse {
  scheduled: boolean;
  noteId?: string;
}

export const cadenceApi = {
  optOuts: () => api.get<OptOutRecordDTO[]>('/api/cadence/opt-outs'),
  runs: (status?: CadenceRunStatus[]) => {
    const query =
      status && status.length > 0
        ? `?status=${status.map((s) => STATUS_TO_QUERY[s]).join(',')}`
        : '';
    return api.get<CadenceRunDTO[]>(`/api/cadence/runs${query}`);
  },
  sequences: () => api.get<CadenceSequenceDTO[]>('/api/cadence/sequences'),
  createSequence: (input: { name: string; description?: string; touches: CadenceTouchInput[] }) =>
    api.post<CadenceSequenceDTO>('/api/cadence/sequences', input),
  /** Encerra a sequência (reversível — `active: false`, não exclusão física). Distinto de
   * `stopRun`: aquele para uma execução individual já em andamento; este impede que a sequência
   * seja escolhida em novas execuções dali em diante. */
  deactivateSequence: (id: string) =>
    api.post<CadenceSequenceDTO>(`/api/cadence/sequences/${id}/deactivate`, {}),
  startRun: (input: { leadId: string; sequenceId: string }) =>
    api.post<StartCadenceRunResponse>('/api/cadence/runs', input),
  pauseRun: (id: string) => api.post<CadenceRunDTO>(`/api/cadence/runs/${id}/pause`, {}),
  resumeRun: (id: string) => api.post<CadenceRunDTO>(`/api/cadence/runs/${id}/resume`, {}),
  stopRun: (id: string) => api.post<CadenceRunDTO>(`/api/cadence/runs/${id}/stop`, {}),
  templates: () => api.get<CadenceJourneyTemplate[]>('/api/cadence/templates'),
  createSequenceFromTemplate: (templateId: string) =>
    api.post<CadenceSequenceDTO>(`/api/cadence/sequences/from-template/${templateId}`, {}),
  scheduleMeeting: (leadId: string, input: { proposedStart: string; proposedEnd: string }) =>
    api.post<ScheduleMeetingResponse>(`/api/cadence/leads/${leadId}/schedule-meeting`, input),
};
