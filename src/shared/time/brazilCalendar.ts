/** Calendário canônico da operação AtlasGR/TotalTrac (America/Sao_Paulo). */
export const BRAZIL_TIME_ZONE = 'America/Sao_Paulo';
export const BRAZIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Componentes de calendário no horário de Brasília para um instante UTC. */
export function brazilDateParts(date: Date): { year: number; month: number; day: number } {
    const shifted = new Date(date.getTime() - BRAZIL_UTC_OFFSET_MS);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth(),
        day: shifted.getUTCDate(),
    };
}

/** 00:00:00 do dia informado em Brasília, devolvido como instante UTC. */
export function brazilMidnightUtc(year: number, month: number, day: number): Date {
    return new Date(Date.UTC(year, month, day, 3, 0, 0, 0));
}

/** 23:59:59.999 do dia informado em Brasília, devolvido como instante UTC. */
export function brazilEndOfDayUtc(year: number, month: number, day: number): Date {
    return new Date(Date.UTC(year, month, day, 26, 59, 59, 999));
}

/** Mês comercial YYYY-MM segundo Brasília, não segundo UTC nem timezone do browser/servidor. */
export function brazilMonthKey(date: Date): string {
    const { year, month } = brazilDateParts(date);
    return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Intervalo mensal [start, end) em Brasília, representado por instantes UTC. */
export function brazilMonthRange(period: string): { start: Date; end: Date; daysInMonth: number } {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
    if (!match) throw new Error(`Período mensal inválido: ${period}`);

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const start = brazilMidnightUtc(year, month, 1);
    const end = brazilMidnightUtc(year, month + 1, 1);
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    return { start, end, daysInMonth };
}

/** Desloca uma chave YYYY-MM por meses de calendário, inclusive atravessando anos. */
export function shiftBrazilMonth(period: string, offset: number): string {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
    if (!match) throw new Error(`Período mensal inválido: ${period}`);

    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
