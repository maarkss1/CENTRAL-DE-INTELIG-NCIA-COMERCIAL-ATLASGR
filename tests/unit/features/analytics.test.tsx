import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const dashboardMock = vi.fn();

vi.mock('@/features/analytics/analytics.api', async () => {
    const actual = await vi.importActual<typeof import('@/features/analytics/analytics.api')>(
        '@/features/analytics/analytics.api',
    );
    return { ...actual, analyticsApi: { dashboard: (m: number) => dashboardMock(m) } };
});

import { Analytics } from '@/features/analytics/components/Analytics';
import { formatMonthLabel } from '@/features/analytics/analytics.api';
import { BrandProvider } from '@/contexts/BrandContext';

function render(ui: React.ReactElement) {
    return rtlRender(<BrandProvider>{ui}</BrandProvider>);
}

const dashboardCheio = {
    overview: {
        totalCompanies: 40, totalContacts: 55, totalLeads: 18, totalActivities: 90,
        pendingActivities: 12, overdueActivities: 4, closedThisMonth: 3, lostThisMonth: 1,
        conversionRate: 21.5, averageScore: 62, pipelineValue: null,
    },
    funnel: [
        { label: 'Novo Lead', count: 30, conversionFromPrevious: null },
        { label: 'Qualificação', count: 21, conversionFromPrevious: 70 },
    ],
    byTemperature: [{ label: 'Quente', count: 8 }],
    bySource: [{ label: 'Indicação', count: 11 }],
    byOwner: [{ label: 'Marcelo', count: 14, won: 5 }],
    activitiesByType: [{ label: 'Ligação', count: 33 }],
    activitiesByStatus: [{ label: 'Pendente', count: 12 }],
    monthly: [{ month: '2026-07', created: 9, won: 3, lost: 1 }],
    isEmpty: false,
};

beforeEach(() => {
    vi.clearAllMocks();
    dashboardMock.mockResolvedValue(dashboardCheio);
    // Recharts mede o container; em jsdom o tamanho é 0 e os gráficos não desenham.
    // Fixamos um tamanho para o ResponsiveContainer renderizar.
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('formatMonthLabel', () => {
    it('formata YYYY-MM no rótulo curto do eixo', () => {
        expect(formatMonthLabel('2026-07')).toMatch(/jul.*26/i);
    });

    it('devolve a entrada intacta quando o formato é inesperado', () => {
        expect(formatMonthLabel('sem-mes')).toBe('sem-mes');
    });
});

describe('Analytics', () => {
    it('carrega 6 meses por padrão', async () => {
        render(<Analytics />);
        await waitFor(() => expect(dashboardMock).toHaveBeenCalledWith(6));
    });

    it('exibe os indicadores de topo vindos da API', async () => {
        render(<Analytics />);
        expect(await screen.findByText('18')).toBeTruthy();      // leads em aberto
        expect(screen.getByText('21.5%')).toBeTruthy();          // conversão
        expect(screen.getByText('4')).toBeTruthy();              // atividades atrasadas
        expect(screen.getByText(/12 pendentes no total/)).toBeTruthy();
    });

    it('recarrega ao trocar o período', async () => {
        const user = userEvent.setup();
        render(<Analytics />);
        await waitFor(() => expect(dashboardMock).toHaveBeenCalledWith(6));

        await user.click(screen.getByRole('button', { name: '12m' }));
        await waitFor(() => expect(dashboardMock).toHaveBeenCalledWith(12));
    });

    it('mostra estado vazio quando a organização não tem dados', async () => {
        dashboardMock.mockResolvedValue({ ...dashboardCheio, isEmpty: true });
        render(<Analytics />);
        expect(await screen.findByText('Ainda não há dados para analisar')).toBeTruthy();
    });

    it('mostra erro recuperável quando a API falha', async () => {
        dashboardMock.mockRejectedValue(new Error('Banco indisponível'));
        render(<Analytics />);
        expect(await screen.findByText('Banco indisponível')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy();
    });

    it('oferece a tabela-gêmea para não depender só do gráfico', async () => {
        const user = userEvent.setup();
        render(<Analytics />);
        await screen.findByText('Funil comercial');

        // Nenhuma tabela antes de pedir.
        expect(screen.queryByText('Conversão da etapa anterior')).toBeNull();

        await user.click(screen.getAllByTitle('Ver como tabela')[0]);

        expect(await screen.findByText('Conversão da etapa anterior')).toBeTruthy();
        // A primeira etapa não tem etapa anterior, então exibe travessão em vez de 0%.
        expect(screen.getByText('—')).toBeTruthy();
        expect(screen.getByText('70.0%')).toBeTruthy();
    });
});
