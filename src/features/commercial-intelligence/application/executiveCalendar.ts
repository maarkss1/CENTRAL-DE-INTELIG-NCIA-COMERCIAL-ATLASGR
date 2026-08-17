/**
 * Utilitários de calendário puros para o cockpit executivo — usados pela "Proteção 90 dias"
 * (seção 11 do prompt de produto: Coverage do mês atual + M+1 + M+2 + M+3 em MESES DE CALENDÁRIO,
 * distinto das janelas móveis de 30/60/90 dias já existentes em `coverage30/60/90`) e pelo ritmo de
 * criação de pipeline (seção 21, que pede "considerar dias úteis quando possível").
 *
 * Sem I/O, sem `Date.now()` implícito — sempre recebe as datas explicitamente (mesmo espírito de
 * `forecastEngine.ts`/`pipelineEligibility.ts`).
 */

const MONTH_LABELS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/** Desloca um período "YYYY-MM" em `delta` meses (positivo ou negativo). */
export function shiftMonth(period: string, delta: number): string {
    const [year, month] = period.split('-').map(Number);
    const base = new Date(Date.UTC(year, month - 1 + delta, 1));
    return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Rótulo curto pt-BR de um período "YYYY-MM", ex.: "AGO/2026". */
export function monthLabelPt(period: string): string {
    const [year, month] = period.split('-').map(Number);
    return `${MONTH_LABELS_PT[month - 1]}/${year}`;
}

/** Conta dias úteis (segunda a sexta) no intervalo [start, end) — end exclusivo. */
export function countBusinessDays(start: Date, end: Date): number {
    if (end <= start) return 0;
    let count = 0;
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    while (cursor < endDay) {
        const weekday = cursor.getUTCDay();
        if (weekday !== 0 && weekday !== 6) count++;
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return count;
}
