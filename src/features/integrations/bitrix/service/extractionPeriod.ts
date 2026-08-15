/**
 * Resolução de período para o serviço real de Extrações Bitrix (Onda 7, Agente 06/06A) — puro,
 * sem I/O, para poder testar cada preset sem mockar rede/banco (ver seção 9/18 de
 * `.agents/prompts/06A-extracoes-bitrix.md`: "cada opção de período" é teste obrigatório).
 *
 * Timezone: o produto é 100% Brasil (AtlasGR/TotalTrac) — usa o offset fixo de
 * America/Sao_Paulo (UTC-03:00, sem horário de verão desde 2019, Lei 13.919/2019) em vez de uma
 * biblioteca de timezone só para isto. Documentado aqui de propósito: se o produto algum dia
 * operar fora do Brasil, isto precisa virar um offset por organização.
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

const BR_OFFSET_MS = 3 * 60 * 60 * 1000; // America/Sao_Paulo = UTC-03:00 (fixo)

/** Componentes de calendário (ano/mês/dia) do horário de Brasília correspondente a um instante UTC. */
function brazilDateParts(date: Date): { year: number; month: number; day: number } {
    const shifted = new Date(date.getTime() - BR_OFFSET_MS);
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/** 00:00:00 do dia informado, horário de Brasília, devolvido como instante UTC real. */
function brazilMidnightUtc(year: number, month: number, day: number): Date {
    return new Date(Date.UTC(year, month, day, 3, 0, 0, 0));
}

/** 23:59:59.999 do dia informado, horário de Brasília, devolvido como instante UTC real. */
function brazilEndOfDayUtc(year: number, month: number, day: number): Date {
    return new Date(Date.UTC(year, month, day, 26, 59, 59, 999));
}

class InvalidExtractionPeriodError extends Error {}

function parseCustomBoundary(value: string, boundary: 'from' | 'to'): Date {
    // Aceita tanto "YYYY-MM-DD" (a UI manda um <input type="date">) quanto um ISO datetime
    // completo — no primeiro caso, "from" vira início do dia e "to" vira fim do dia em horário de
    // Brasília, para o intervalo ser de fato inclusivo nas duas pontas (sem isso, filtrar
    // "01/08 a 05/08" excluiria os registros criados depois da meia-noite UTC do dia 05, que ainda
    // é dia 04 em Brasília até as 21h).
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(value.trim());
    if (dateOnly) {
        const [year, month, day] = value.trim().split('-').map(Number);
        return boundary === 'from' ? brazilMidnightUtc(year, month - 1, day) : brazilEndOfDayUtc(year, month - 1, day);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new InvalidExtractionPeriodError(`Data ${boundary === 'from' ? 'inicial' : 'final'} inválida: "${value}".`);
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
            throw new InvalidExtractionPeriodError('Período personalizado exige ao menos a data inicial.');
        }
        const from = parseCustomBoundary(custom.from, 'from');
        const to = custom.to ? parseCustomBoundary(custom.to, 'to') : now;
        if (from.getTime() > to.getTime()) {
            throw new InvalidExtractionPeriodError('A data inicial não pode ser depois da data final.');
        }
        return { from, to };
    }

    const { year, month, day } = brazilDateParts(now);

    if (period === 'today') {
        return { from: brazilMidnightUtc(year, month, day), to: now };
    }

    if (period === 'last7days') {
        // Janela corrida de 7×24h (não "desde a meia-noite de 6 dias atrás") — evita a ambiguidade
        // de calendário de fuso e é o que a maioria das pessoas espera de "últimos 7 dias" num
        // filtro de exportação (mesmo critério documentado no cabeçalho do arquivo).
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

    // Exaustivo por construção (BitrixExtractionPeriod não tem mais nenhum outro valor) — TS
    // reclamaria em compile-time se um preset novo fosse adicionado ao tipo sem vir aqui também.
    const _exhaustive: never = period;
    throw new InvalidExtractionPeriodError(`Preset de período desconhecido: ${String(_exhaustive)}`);
}

export { InvalidExtractionPeriodError };
