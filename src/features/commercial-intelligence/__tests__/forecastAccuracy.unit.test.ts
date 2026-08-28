import { describe, it, expect } from 'vitest';
import { computeForecastAccuracy, hasPeriodClosed, summarizeForecastAccuracy } from '../application/forecastAccuracy';
import type { ForecastSnapshotRecord } from '../domain/CommercialIntelligence';

const ORG = 'org-1';

function snapshot(overrides: Partial<ForecastSnapshotRecord> = {}): ForecastSnapshotRecord {
    return {
        id: 'snap-1',
        organizationId: ORG,
        period: '2026-07',
        snapshotAt: '2026-07-15T12:00:00.000Z',
        rulesVersion: 'v1',
        commitAmount: 50_000,
        bestCaseAmount: 20_000,
        forecastAmount: 90_000,
        currency: 'BRL',
        ...overrides,
    };
}

describe('forecastAccuracy.hasPeriodClosed', () => {
    it('período ainda não fechou quando "now" está dentro do próprio mês', () => {
        expect(hasPeriodClosed('2026-08', new Date('2026-08-15T12:00:00Z'))).toBe(false);
    });

    it('período fechou quando "now" já está no mês seguinte', () => {
        expect(hasPeriodClosed('2026-08', new Date('2026-09-02T00:00:00Z'))).toBe(true);
    });
});

describe('forecastAccuracy.computeForecastAccuracy — honestidade sobre ausência de dado', () => {
    const NOW_PERIOD_OPEN = new Date('2026-07-20T00:00:00Z'); // dentro de julho — julho ainda não fechou
    const NOW_PERIOD_CLOSED = new Date('2026-08-05T00:00:00Z'); // depois do fim de julho

    it('período ainda não fechou: available=false, reason="periodo_nao_fechou", nunca um erro fabricado', () => {
        const result = computeForecastAccuracy('2026-07', snapshot(), 80_000, NOW_PERIOD_OPEN);
        expect(result.available).toBe(false);
        expect(result.reason).toBe('periodo_nao_fechou');
        expect(result.errorAmount).toBeNull();
        expect(result.errorPercent).toBeNull();
    });

    it('período fechou mas sem snapshot: available=false, reason="sem_snapshot"', () => {
        const result = computeForecastAccuracy('2026-07', null, 80_000, NOW_PERIOD_CLOSED);
        expect(result.available).toBe(false);
        expect(result.reason).toBe('sem_snapshot');
    });

    it('período fechou e há snapshot, mas realizado é desconhecido: available=false, reason="sem_realizado"', () => {
        const result = computeForecastAccuracy('2026-07', snapshot(), null, NOW_PERIOD_CLOSED);
        expect(result.available).toBe(false);
        expect(result.reason).toBe('sem_realizado');
    });

    it('motor superestimou: forecast previsto > realizado, direction="superestimou"', () => {
        const result = computeForecastAccuracy('2026-07', snapshot({ forecastAmount: 90_000 }), 60_000, NOW_PERIOD_CLOSED);
        expect(result.available).toBe(true);
        expect(result.errorAmount).toBe(30_000);
        expect(result.errorPercent).toBeCloseTo(50, 5); // |30000| / 60000 * 100
        expect(result.direction).toBe('superestimou');
    });

    it('motor subestimou: forecast previsto < realizado, direction="subestimou"', () => {
        const result = computeForecastAccuracy('2026-07', snapshot({ forecastAmount: 50_000 }), 80_000, NOW_PERIOD_CLOSED);
        expect(result.errorAmount).toBe(-30_000);
        expect(result.direction).toBe('subestimou');
    });

    it('motor acertou em cheio: erro 0, direction="acertou"', () => {
        const result = computeForecastAccuracy('2026-07', snapshot({ forecastAmount: 80_000 }), 80_000, NOW_PERIOD_CLOSED);
        expect(result.errorAmount).toBe(0);
        expect(result.errorPercent).toBe(0);
        expect(result.direction).toBe('acertou');
    });

    it('realizado igual a zero: errorPercent fica null (nunca divide por zero)', () => {
        const result = computeForecastAccuracy('2026-07', snapshot({ forecastAmount: 10_000 }), 0, NOW_PERIOD_CLOSED);
        expect(result.available).toBe(true);
        expect(result.errorAmount).toBe(10_000);
        expect(result.errorPercent).toBeNull();
    });

    it('carrega a versão de regras do snapshot original, não uma versão atual recalculada', () => {
        const result = computeForecastAccuracy('2026-07', snapshot({ rulesVersion: 'v0-legado' }), 80_000, NOW_PERIOD_CLOSED);
        expect(result.rulesVersion).toBe('v0-legado');
    });
});

describe('forecastAccuracy.summarizeForecastAccuracy', () => {
    it('sem nenhuma amostra disponível: available=false, reason="sem_historico_suficiente" — resultado esperado logo após a implementação', () => {
        const summary = summarizeForecastAccuracy([]);
        expect(summary.available).toBe(false);
        expect(summary.reason).toBe('sem_historico_suficiente');
        expect(summary.meanAbsoluteErrorPercent).toBeNull();
    });

    it('ignora amostras indisponíveis e calcula a média só das avaliáveis', () => {
        const NOW_PERIOD_CLOSED = new Date('2026-09-05T00:00:00Z');
        const samples = [
            computeForecastAccuracy('2026-07', snapshot({ period: '2026-07', forecastAmount: 110_000 }), 100_000, NOW_PERIOD_CLOSED), // erro 10%
            computeForecastAccuracy('2026-08', snapshot({ period: '2026-08', forecastAmount: 130_000 }), 100_000, NOW_PERIOD_CLOSED), // erro 30%
            computeForecastAccuracy('2026-09', null, null, new Date('2026-09-01T00:00:00Z')), // indisponível, ignorado
        ];
        const summary = summarizeForecastAccuracy(samples);
        expect(summary.available).toBe(true);
        expect(summary.sampleSize).toBe(2);
        expect(summary.meanAbsoluteErrorPercent).toBeCloseTo(20, 5);
    });
});
