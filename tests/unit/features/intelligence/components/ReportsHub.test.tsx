/**
 * Cobre o Hub de Relatórios de IA (C-Level Analytics): carregamento das métricas-base da
 * plataforma (analyticsDB.overview) e a geração do relatório interpretativo via IA
 * (POST /api/intelligence/report/stream, SSE), incluindo os caminhos de erro de cada chamada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const overviewMock = vi.fn();
const postMock = vi.fn();
const getMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('@/lib/db', () => ({
    analyticsDB: { overview: (...args: unknown[]) => overviewMock(...args) },
}));

vi.mock('@/lib/api', () => ({
    api: {
        post: (...args: unknown[]) => postMock(...args),
        get: (...args: unknown[]) => getMock(...args),
    },
}));

/** Monta um `Response` cujo `body` entrega os frames SSE dados, um por `read()`, como readSseStream espera. */
function sseResponse(frames: string[], ok = true): Response {
    const encoder = new TextEncoder();
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
            if (i < frames.length) {
                controller.enqueue(encoder.encode(frames[i]));
                i += 1;
            } else {
                controller.close();
            }
        },
    });
    return { ok, status: ok ? 200 : 500, body: stream } as unknown as Response;
}

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
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

    it('exibe atividades atrasadas, perdidos no mês e score médio a partir da mesma resposta de overview', async () => {
        render(<ReportsHub />);
        expect(await screen.findByText('2')).toBeInTheDocument(); // Atrasadas
        expect(screen.getByText('1')).toBeInTheDocument(); // Perdidos no Mês
        expect(screen.getByText('70')).toBeInTheDocument(); // Score Médio
    });

    it('mostra "—" para o score médio quando a IA ainda não pontuou nenhum lead', async () => {
        overviewMock.mockResolvedValue({ ...metricsFixture, averageScore: null });
        render(<ReportsHub />);
        const dashes = await screen.findAllByText('—');
        expect(dashes).toHaveLength(2); // Valor em Pipeline + Score Médio
    });

    it('mostra erro ao falhar o carregamento das métricas e desabilita o botão de gerar', async () => {
        overviewMock.mockRejectedValue(new Error('falhou'));
        render(<ReportsHub />);

        expect(await screen.findByText('Não foi possível carregar os dados da plataforma.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Interpretar Dados com IA/ })).toBeDisabled();
    });

    it('distingue falha ao buscar a série mensal de uma série real vazia', async () => {
        getMock.mockRejectedValue(new Error('timeout na API de analytics'));
        render(<ReportsHub />);

        expect(await screen.findByText('timeout na API de analytics')).toBeInTheDocument();
        expect(screen.getByText('Não foi possível carregar a série mensal.')).toBeInTheDocument();
        expect(screen.queryByText('Sem dados suficientes ainda.')).not.toBeInTheDocument();
    });

    it('gera o relatório de IA a partir das métricas carregadas (streaming)', async () => {
        fetchMock.mockResolvedValue(sseResponse([
            `event: delta\ndata: ${JSON.stringify({ delta: '# Diagnóstico\n' })}\n\n`,
            `event: delta\ndata: ${JSON.stringify({ delta: 'Tudo certo.' })}\n\n`,
            `event: end\ndata: ${JSON.stringify({ reportId: 'r1', createdAt: '2026-08-21T12:00:00.000Z' })}\n\n`,
        ]));
        const user = userEvent.setup();
        render(<ReportsHub />);

        const button = await screen.findByRole('button', { name: /Interpretar Dados com IA/ });
        await waitFor(() => expect(button).not.toBeDisabled());
        await user.click(button);

        expect(await screen.findByText('Diagnóstico')).toBeInTheDocument();
        expect(screen.getByText('Tudo certo.')).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/intelligence/report/stream',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ metrics: metricsFixture, brandId: 'atlasgr' }),
            }),
        );
    });

    it('mostra erro recuperável quando a geração do relatório de IA falha', async () => {
        fetchMock.mockResolvedValue(sseResponse([
            `event: error\ndata: ${JSON.stringify('IA indisponível')}\n\n`,
        ]));
        const user = userEvent.setup();
        render(<ReportsHub />);

        const button = await screen.findByRole('button', { name: /Interpretar Dados com IA/ });
        await waitFor(() => expect(button).not.toBeDisabled());
        await user.click(button);

        expect(await screen.findByText('IA indisponível')).toBeInTheDocument();
    });
});
