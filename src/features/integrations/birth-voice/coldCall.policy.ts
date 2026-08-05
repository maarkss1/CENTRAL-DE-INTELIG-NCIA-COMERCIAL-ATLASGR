/**
 * Regras que decidem *quando* e *para quem* a prospecção fria pode discar.
 *
 * Puro de propósito: sem banco, sem rede, sem relógio implícito. É a camada que impede o SDR
 * automático de virar um problema jurídico, então precisa ser legível e testável isoladamente.
 */

export interface CallWindow {
    /** Hora local em que a discagem pode começar (inclusiva). */
    startHour: number;
    /** Hora local em que a discagem para (exclusiva) — 18 significa "até 17:59". */
    endHour: number;
    /** Sábado e domingo fora. Ligação comercial em fim de semana é incômodo, não oportunidade. */
    weekdaysOnly: boolean;
    /** IANA, ex: 'America/Sao_Paulo'. O servidor costuma rodar em UTC. */
    timeZone: string;
}

export const DEFAULT_CALL_WINDOW: CallWindow = {
    startHour: 9,
    endHour: 18,
    weekdaysOnly: true,
    timeZone: 'America/Sao_Paulo',
};

const WEEKEND = new Set(['Sat', 'Sun']);

/**
 * Se agora é hora permitida para ligar, no fuso do destinatário.
 *
 * A conversão de fuso é o ponto crítico: um servidor em UTC que comparasse `getHours()` ligaria
 * às 6h da manhã no Brasil achando que são 9h.
 */
export function isWithinCallWindow(now: Date, window: CallWindow = DEFAULT_CALL_WINDOW): boolean {
    const is24hMode = window.startHour === 0 && (window.endHour >= 24 || window.endHour === 0);

    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: window.timeZone,
        hourCycle: 'h23',
        hour: '2-digit',
        weekday: 'short',
    }).formatToParts(now);

    const hourPart = parts.find((p) => p.type === 'hour')?.value;
    const weekdayPart = parts.find((p) => p.type === 'weekday')?.value;
    if (hourPart === undefined || weekdayPart === undefined) return false;

    if (window.weekdaysOnly && !is24hMode && WEEKEND.has(weekdayPart)) return false;

    const hour = Number(hourPart);
    if (is24hMode) return true;
    return hour >= window.startHour && hour < window.endHour;
}

export interface LeadDialCandidate {
    id: string;
    /** Última interação registrada, de qualquer canal. */
    lastInteraction: Date | null;
    /** Quantas ligações do SDR este lead já recebeu. */
    attempts: number;
}

export interface DialPolicy {
    maxAttemptsPerLead: number;
    /** Horas mínimas entre uma tentativa e a seguinte para o mesmo lead. */
    retryCooldownHours: number;
}

export type SkipReason = 'max-attempts' | 'cooldown';

/**
 * Se este lead pode receber uma ligação agora. Devolve o motivo da recusa para o log dizer por que
 * a campanha não ligou, em vez de simplesmente não ligar.
 */
export function evaluateLead(
    lead: LeadDialCandidate,
    policy: DialPolicy,
    now: Date,
): { eligible: true } | { eligible: false; reason: SkipReason } {
    if (lead.attempts >= policy.maxAttemptsPerLead) {
        return { eligible: false, reason: 'max-attempts' };
    }

    if (lead.lastInteraction) {
        const hoursSince = (now.getTime() - lead.lastInteraction.getTime()) / 3_600_000;
        if (hoursSince < policy.retryCooldownHours) {
            return { eligible: false, reason: 'cooldown' };
        }
    }

    return { eligible: true };
}
