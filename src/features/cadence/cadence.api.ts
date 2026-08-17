import { api } from '../../lib/api';

/**
 * Cliente HTTP de `/api/cadence/*` (Agente 17, Onda 10) — mesmo padrão de
 * `src/features/analytics/analytics.api.ts`: tipos locais espelhando o shape real da resposta
 * (não os tipos de domínio do backend, `src/features/cadence/domain/cadence.ts`/`optOut.ts` — sobre
 * o arame, datas chegam como string ISO, não `Date`).
 *
 * Só leitura por enquanto: `cadence.routes.ts` ainda não expõe pausar/retomar/parar um run (ver
 * nota no router) — quando existir, os métodos entram aqui.
 */

export type CadenceRunStatus = 'active' | 'paused' | 'stopped';
export type CadenceStopReason = 'opt-out' | 'lead-reply' | 'completed' | 'manual-stop';
export type CadenceChannel = 'email' | 'whatsapp' | 'voice';
export type CadenceTouchResult = 'sent' | 'failed' | 'skipped';
export type CadenceSkipReason = 'outside-business-window' | 'opt-out' | 'lead-replied' | 'paused';
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
    channel: CadenceChannel;
    attemptedAt: string;
    result: CadenceTouchResult;
    skipReason?: CadenceSkipReason;
    error?: string | null;
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

/** A rota aceita status em PascalCase (`Active`/`Paused`/`Stopped`, mesma casing do enum Postgres) — mapeado aqui pra não vazar essa convenção pro resto do frontend. */
const STATUS_TO_QUERY: Record<CadenceRunStatus, string> = {
    active: 'Active',
    paused: 'Paused',
    stopped: 'Stopped',
};

export const cadenceApi = {
    optOuts: () => api.get<OptOutRecordDTO[]>('/api/cadence/opt-outs'),
    runs: (status?: CadenceRunStatus[]) => {
        const query = status && status.length > 0
            ? `?status=${status.map((s) => STATUS_TO_QUERY[s]).join(',')}`
            : '';
        return api.get<CadenceRunDTO[]>(`/api/cadence/runs${query}`);
    },
};
