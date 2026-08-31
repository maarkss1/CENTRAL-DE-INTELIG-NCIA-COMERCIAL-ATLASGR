import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TrendChartCard } from '@/features/commercial-intelligence/components/TrendChartCard';
import type { HistoricalTrendsReport } from '@/features/commercial-intelligence/commercialIntelligence.api';

function point(label: string, winRate: number | null) {
    return {
        period: label,
        label,
        winRate,
        salesCycleMeanDays: null,
        averageTicketWon: null,
        pipelineCreatedAmount: null,
        closedSampleSize: 0,
    };
}

afterEach(() => cleanup());

describe('TrendChartCard', () => {
    it('não renderiza nada quando não há trends', () => {
        const { container } = render(<TrendChartCard trends={null} />);
        expect(container.firstChild).toBeNull();
    });

    it('não renderiza com menos de 2 pontos de winRate real — 1 ponto não é evolução', () => {
        const trends: HistoricalTrendsReport = { points: [point('jan/26', 40)] };
        const { container } = render(<TrendChartCard trends={trends} />);
        expect(container.firstChild).toBeNull();
    });

    it('filtra pontos com winRate nulo em vez de fabricar um valor', () => {
        const trends: HistoricalTrendsReport = {
            points: [point('jan/26', 40), point('fev/26', null), point('mar/26', 55)],
        };
        render(<TrendChartCard trends={trends} />);
        expect(screen.getByText('Evolução do Win Rate')).toBeTruthy();
    });

    it('renderiza o gráfico com dado real suficiente', () => {
        const trends: HistoricalTrendsReport = {
            points: [point('jan/26', 40), point('fev/26', 48), point('mar/26', 55)],
        };
        const { container } = render(<TrendChartCard trends={trends} />);
        expect(screen.getByText('Evolução do Win Rate')).toBeTruthy();
        expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
    });
});
