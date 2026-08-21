import {
    brazilDateParts,
    brazilEndOfDayUtc,
    brazilMidnightUtc,
} from '../../../../shared/time/brazilCalendar.js';

/**
 * Resolução de período para o serviço real de Extrações Bitrix (Onda 7, Agente 06/06A) — puro,
 * sem I/O, para poder testar cada preset sem mockar rede/banco (ver seção 9/18 de
 * `.agents/prompts/06A-extracoes-bitrix.md`: "cada opção de período" é teste obrigatório).
 *
 * Timezone: usa o calendário canônico da operação em `shared/time/brazilCalendar.ts`, baseado em
 * America/Sao_Paulo (UTC-03:00 desde 2019). Se o produto operar fora do Brasil, essa política deve
 * evoluir para timezone por organização em um único lugar, sem fórmulas paralelas por feature.
 */

export type BitrixExtractionPeriod =
    | 'today'
    | 'last7days'
    | 'thisMonth'
    | 'thisQuarter'
    | 'thisSemester'
    | 'all'
    | 'custom';

export const EXTRACTION_PERIODS: readonly BitrixExtractionPeriod[] = [
    'today', 'last7days', 'thisMonth', 'thisQuarter', 'thisSemester', 'all', 'custom',
];

export interface PeriodRange {
    /** Limite inferior, inclusivo. */
    from: Date;
    /** Limite superior, inclusivo. */
    to: Date;
}

class InvalidExtractionPeriodError extends Error {}

function parseCustomBoundary(value: string, boundary: 'from' | 'to'): Date {
    // Aceita tanto "YYYY-MM-DD" (a UI manda um <input type="date">) quanto um ISO datetime
    // completo — no primeiro caso, "from" vira início do dia e "to" vira fim do dia em horário de
    // Brasília, para o intervalo ser de fato inclusivo nas duas pontas.
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(value.trim());
    if (dateOnly) {
        const [year, month, day] = value.trim().split('-').map(Number);
        return boundary === 'from'
            ? brazilMidnightUtc(year, month - 1, day)
            : brazilEndOfDayUtc(year, month - 1, day);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new InvalidExtractionPeriodError(
            `Data ${boundary === 'from' ? 'inicial' : 'final'} inválida: "${value}".`,
        );
    }
    return parsed;
}

/**
 * Devolve o intervalo [from, to] (ambos inclusivos) correspondente ao preset — ou `null` para
 * "all" (todas as datas, sem filtro de data nenhum). `now` é injetável para teste determinístico.
 */
export function resolvePeriodRange(
    period: BitrixExtractionPeriod,
    custom: { from?: string; to?: string } = {},
    now: Date = new Date(),
): PeriodRange | null {
    if (period === 'all') return null;

    if (period === 'custom') {
        if (!custom.from) {
            throw new InvalidExtractionPeriodError(
                'Período personalizado exige ao menos a data inicial.',
            );
        }
        const from = parseCustomBoundary(custom.from, 'from');
        const to = custom.to ? parseCustomBoundary(custom.to, 'to') : now;
        if (from.getTime() > to.getTime()) {
            throw new InvalidExtractionPeriodError(
                'A data inicial não pode ser depois da data final.',
            );
        }
        return { from, to };
    }

    const { year, month, day } = brazilDateParts(now);

    if (period === 'today') {
        return { from: brazilMidnightUtc(year, month, day), to: now };
    }

    if (period === 'last7days') {
        // Janela corrida de 7×24h: não depende de meia-noite nem do timezone do executor.
        return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now };
    }

    if (period === 'thisMonth') {
        return { from: brazilMidnightUtc(year, month, 1), to: now };
    }

    if (period === 'thisQuarter') {
        const quarterStartMonth = Math.floor(month / 3) * 3;
        return { from: brazilMidnightUtc(year, quarterStartMonth, 1), to: now };
    }

    if (period === 'thisSemester') {
        const semesterStartMonth = month < 6 ? 0 : 6;
        return { from: brazilMidnightUtc(year, semesterStartMonth, 1), to: now };
    }

    const _exhaustive: never = period;
    throw new InvalidExtractionPeriodError(
        `Preset de período desconhecido: ${String(_exhaustive)}`,
    );
}

export { InvalidExtractionPeriodError };
