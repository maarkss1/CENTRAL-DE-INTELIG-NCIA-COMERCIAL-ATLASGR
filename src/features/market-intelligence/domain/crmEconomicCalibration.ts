export type CrmCalibrationQuality = 'INSUFICIENTE' | 'BAIXA' | 'MEDIA' | 'ALTA';

export interface HistoricalCommercialSignal {
    period: string;
    label?: string;
    winRate: number | null;
    salesCycleMeanDays: number | null;
    averageTicketWon: number | null;
    closedSampleSize: number;
}

export interface CrmEconomicCalibration {
    quality: CrmCalibrationQuality;
    eligible: boolean;
    totalClosedSample: number;
    monthsWithClosedSample: number;
    fromPeriod: string | null;
    toPeriod: string | null;
    recommended: {
        averageMrrTicket: number | null;
        winRatePct: number | null;
        salesCycleDays: number | null;
    };
    blockers: string[];
}

function finiteNonNegative(value: number | null): number | null {
    return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

function weightedMean(
    points: HistoricalCommercialSignal[],
    pick: (point: HistoricalCommercialSignal) => number | null,
): number | null {
    let weighted = 0;
    let weight = 0;
    for (const point of points) {
        const value = finiteNonNegative(pick(point));
        const sample = Number.isFinite(point.closedSampleSize) ? Math.max(0, point.closedSampleSize) : 0;
        if (value === null || sample <= 0) continue;
        weighted += value * sample;
        weight += sample;
    }
    return weight > 0 ? weighted / weight : null;
}

function median(values: number[]): number | null {
    const clean = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
    if (!clean.length) return null;
    const middle = Math.floor(clean.length / 2);
    return clean.length % 2 === 0 ? (clean[middle - 1] + clean[middle]) / 2 : clean[middle];
}

function qualityFor(totalClosedSample: number, monthsWithClosedSample: number): CrmCalibrationQuality {
    if (totalClosedSample < 10 || monthsWithClosedSample < 2) return 'INSUFICIENTE';
    if (totalClosedSample >= 50 && monthsWithClosedSample >= 4) return 'ALTA';
    if (totalClosedSample >= 20 && monthsWithClosedSample >= 3) return 'MEDIA';
    return 'BAIXA';
}

/**
 * Calibra somente métricas que já possuem fonte canônica no Comercial Inteligente.
 *
 * - Win Rate: média ponderada pela amostra de negócios fechados do mês.
 * - Sales Cycle: média ponderada pela mesma amostra fechada.
 * - Ticket ganho: mediana dos tickets médios mensais ganhos. O endpoint histórico não publica
 *   `wonCount` por mês, portanto não fingimos uma ponderação por quantidade de ganhos inexistente.
 *
 * A calibração nunca preenche margem, churn, conversão reunião→oportunidade, produtividade,
 * penetração, custos ou política financeira.
 */
export function calibrateSellerEconomicsFromHistory(
    signals: HistoricalCommercialSignal[],
): CrmEconomicCalibration {
    const ordered = [...signals]
        .filter((point) => /^\d{4}-\d{2}$/.test(point.period))
        .sort((a, b) => a.period.localeCompare(b.period));
    const closedMonths = ordered.filter((point) => Number.isFinite(point.closedSampleSize) && point.closedSampleSize > 0);
    const totalClosedSample = closedMonths.reduce((sum, point) => sum + Math.max(0, point.closedSampleSize), 0);
    const monthsWithClosedSample = closedMonths.length;

    const winRatePct = weightedMean(closedMonths, (point) => point.winRate);
    const salesCycleDays = weightedMean(closedMonths, (point) => point.salesCycleMeanDays);
    const averageMrrTicket = median(
        closedMonths
            .map((point) => finiteNonNegative(point.averageTicketWon))
            .filter((value): value is number => value !== null && value > 0),
    );

    const blockers: string[] = [];
    if (totalClosedSample < 10) blockers.push('Amostra insuficiente: são necessários ao menos 10 negócios fechados no histórico selecionado.');
    if (monthsWithClosedSample < 2) blockers.push('Cobertura temporal insuficiente: são necessários ao menos 2 meses com negócios fechados.');
    if (winRatePct === null || winRatePct <= 0) blockers.push('Win Rate histórico não disponível com amostra válida.');
    if (salesCycleDays === null || salesCycleDays <= 0) blockers.push('Sales Cycle histórico não disponível com amostra válida.');
    if (averageMrrTicket === null || averageMrrTicket <= 0) blockers.push('Ticket médio ganho histórico não disponível com amostra válida.');

    const quality = qualityFor(totalClosedSample, monthsWithClosedSample);
    const eligible = quality !== 'INSUFICIENTE' && blockers.length === 0;

    return {
        quality,
        eligible,
        totalClosedSample,
        monthsWithClosedSample,
        fromPeriod: ordered.at(0)?.period ?? null,
        toPeriod: ordered.at(-1)?.period ?? null,
        recommended: {
            averageMrrTicket: eligible ? averageMrrTicket : null,
            winRatePct: eligible ? winRatePct : null,
            salesCycleDays: eligible ? salesCycleDays : null,
        },
        blockers,
    };
}

/** Retorna YYYY-MM no calendário civil de Brasília, inclusive em viradas UTC/BRT. */
export function currentBrasiliaMonth(now = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(now);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    if (!year || !month) throw new Error('Não foi possível resolver o mês civil de Brasília.');
    return `${year}-${month}`;
}
