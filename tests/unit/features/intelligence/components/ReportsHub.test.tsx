/**
 * Cobre o Hub de Relatórios de IA (C-Level Analytics): carregamento das métricas-base da
 * plataforma (analyticsDB.overview) e a geração do relatório interpretativo via IA
 * (POST /api/intelligence/report), incluindo os caminhos de erro de cada chamada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const overviewMock = vi.fn();
const postMock = vi.fn();
const getMock = vi.fn();

vi.mock('@/lib/db', () => ({
    analyticsDB: { overview: (...args: unknown[]) => overviewMock(...args) },
}));

vi.mock('@/lib/api', () => ({
    api: {
        post: (...args: unknown[]) => postMock(...args),
        get: (...args: unknown[]) => getMock(...args),
    },
}));

import { ReportsHub } from '@/features/intelligence/components/ReportsHub';
import { BrandProvider } from '@/contexts/BrandContext';
import { ThemeProvider } from '@/contexts/ThemeContext';

function render(ui: React.ReactElement) {
    return rtlRender(
        <BrandProvider>
            <ThemeProvider>{ui}</ThemeProvider>
        </BrandProvider>,
    );
}

const metricsFixture = {
    totalCompanies: 12,
    totalContacts: 30,
    totalLeads: 9,
    totalActivities: 45,
    pendingActivities: 6,
    overdueActivities: 2,
    closedThisMonth: 3,
    lostThisMonth: 1,
    pipelineValue: null,
    conversionRate: 33.333,
    averageScore: 70,
};

beforeEach(() => {
    vi.clearAllMocks();
    overviewMock.mockResolvedValue(metricsFixture);
    getMock.mockResolvedValue({ monthly: [] });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('ReportsHub', () => {
    it('renderiza sem erro e carrega as métricas-base da plataforma', async () => {
        render(<ReportsHub />);
        expect(screen.getByText('Relatórios & C-Level Analytics')).toBeInTheDocument();
        await waitFor(() => expect(overviewMock).toHaveBeenCalledTimes(1));
        expect(await screen.findByText('12')).toBeInTheDocument(); // Empresas
    });

    it('mostra "—" para o valor de pipeline quando não há campo monetário no modelo', async () => {
        render(<ReportsHub />);
        expect(await screen.findByText('—')).toBeInTheDocument();
    });

    it('mostra erro ao falhar o carregamento das métricas e desabilita o botão de gerar', async () => {
        overviewMock.mockRejectedValue(new Error('falhou'));
        render(<ReportsHub />);

        expect(await screen.findByText('Não foi possível carregar os dados da plataforma.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Interpretar Dados com IA/ })).toBeDisabled();
    });

    it('gera o relatório de IA a partir das métricas carregadas', async () => {
        postMock.mockResolvedValue({ result: '# Diagnóstico\nTudo certo.' });
        const user = userEvent.setup();
        render(<ReportsHub />);

        const button = await screen.findByRole('button', { name: /Interpretar Dados com IA/ });
        await waitFor(() => expect(button).not.toBeDisabled());
        await user.click(button);

        expect(await screen.findByText('Diagnóstico')).toBeInTheDocument();
        expect(screen.getByText('Tudo certo.')).toBeInTheDocument();
        expect(postMock).toHaveBeenCalledWith(
            '/api/intelligence/report',
            { metrics: metricsFixture, brandId: 'atlasgr' },
            { timeoutMs: 90_000 },
        );
    });

    it('mostra erro recuperável quando a geração do relatório de IA falha', async () => {
        postMock.mockRejectedValue(new Error('IA indisponível'));
        const user = userEvent.setup();
        render(<ReportsHub />);

        const button = await screen.findByRole('button', { name: /Interpretar Dados com IA/ });
        await waitFor(() => expect(button).not.toBeDisabled());
        await user.click(button);

        expect(await screen.findByText('IA indisponível')).toBeInTheDocument();
    });
});
