import { describe, expect, it } from 'vitest';
import {
    calibrateSellerEconomicsFromHistory,
    currentBrasiliaMonth,
    type HistoricalCommercialSignal,
} from '../../../src/features/market-intelligence/domain/crmEconomicCalibration';

const history: HistoricalCommercialSignal[] = [
    { period: '2026-03', winRate: 20, salesCycleMeanDays: 60, averageTicketWon: 2000, closedSampleSize: 10 },
    { period: '2026-04', winRate: 30, salesCycleMeanDays: 50, averageTicketWon: 3000, closedSampleSize: 20 },
    { period: '2026-05', winRate: 40, salesCycleMeanDays: 40, averageTicketWon: 4000, closedSampleSize: 30 },
    { period: '2026-06', winRate: 50, salesCycleMeanDays: 30, averageTicketWon: 5000, closedSampleSize: 20 },
];

describe('CRM economic calibration', () => {
    it('calibra win rate e sales cycle pela amostra e ticket pela mediana mensal', () => {
        const result = calibrateSellerEconomicsFromHistory(history);
        expect(result.quality).toBe('ALTA');
        expect(result.eligible).toBe(true);
        expect(result.totalClosedSample).toBe(80);
        expect(result.monthsWithClosedSample).toBe(4);
        expect(result.recommended.winRatePct).toBeCloseTo(37.5);
        expect(result.recommended.salesCycleDays).toBeCloseTo(42.5);
        expect(result.recommended.averageMrrTicket).toBe(3500);
        expect(result.fromPeriod).toBe('2026-03');
        expect(result.toPeriod).toBe('2026-06');
    });

    it('não inventa calibração quando a amostra é insuficiente', () => {
        const result = calibrateSellerEconomicsFromHistory([
            { period: '2026-07', winRate: 50, salesCycleMeanDays: 20, averageTicketWon: 9000, closedSampleSize: 3 },
        ]);
        expect(result.quality).toBe('INSUFICIENTE');
        expect(result.eligible).toBe(false);
        expect(result.recommended).toEqual({ averageMrrTicket: null, winRatePct: null, salesCycleDays: null });
        expect(result.blockers.length).toBeGreaterThan(0);
    });

    it('ignora meses nulos sem transformar ausência em zero', () => {
        const result = calibrateSellerEconomicsFromHistory([
            { period: '2026-05', winRate: 25, salesCycleMeanDays: 45, averageTicketWon: 2500, closedSampleSize: 8 },
            { period: '2026-06', winRate: null, salesCycleMeanDays: null, averageTicketWon: null, closedSampleSize: 0 },
            { period: '2026-07', winRate: 35, salesCycleMeanDays: 35, averageTicketWon: 3500, closedSampleSize: 8 },
        ]);
        expect(result.quality).toBe('BAIXA');
        expect(result.eligible).toBe(true);
        expect(result.recommended.winRatePct).toBe(30);
        expect(result.recommended.salesCycleDays).toBe(40);
        expect(result.recommended.averageMrrTicket).toBe(3000);
    });

    it('mantém ticket indisponível quando não há mês com ganho mensurável', () => {
        const result = calibrateSellerEconomicsFromHistory([
            { period: '2026-05', winRate: 20, salesCycleMeanDays: 50, averageTicketWon: null, closedSampleSize: 10 },
            { period: '2026-06', winRate: 30, salesCycleMeanDays: 40, averageTicketWon: null, closedSampleSize: 10 },
        ]);
        expect(result.eligible).toBe(false);
        expect(result.recommended.averageMrrTicket).toBeNull();
        expect(result.blockers.some((item) => item.includes('Ticket médio ganho'))).toBe(true);
    });

    it('resolve a virada UTC no calendário civil de Brasília', () => {
        expect(currentBrasiliaMonth(new Date('2026-09-01T01:30:00.000Z'))).toBe('2026-08');
        expect(currentBrasiliaMonth(new Date('2026-09-01T03:30:00.000Z'))).toBe('2026-09');
    });
});
