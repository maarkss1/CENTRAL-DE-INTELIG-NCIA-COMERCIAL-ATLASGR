/**
 * Utilidades numéricas/de data compartilhadas por todos os relatórios de Comercial Inteligente.
 * Nenhuma regra de negócio mora aqui — só arredondamento e agregação genéricos reaproveitados por
 * `application/queries/*` e `application/scoring/*`.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export function mean(values: number[]): number | null {
    if (values.length === 0) return null;
    return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;
}

export function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const result = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    return Math.round(result * 100) / 100;
}

export function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
