/**
 * Cobre a tela de consumo de IA (Billing) — deliberadamente NÃO é uma tela de faturamento
 * (não há plano/assinatura no sistema, ver comentário no próprio componente). Testamos que ela
 * busca /api/usage, mostra o estado vazio, o estado de erro e os números vindos da API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const getMock = vi.fn();

vi.mock('@/lib/api', () => ({
    api: { get: (...args: unknown[]) => getMock(...args) },
}));

import { Billing } from '@/features/billing/components/Billing';
import { BrandProvider } from '@/contexts/BrandContext';

function render(ui: React.ReactElement) {
    return rtlRender(<BrandProvider>{ui}</BrandProvider>);
}

const usageCheio = {
    totalTokens: 150_000,
    totalCost: 12.3456,
    totalCalls: 42,
    avgLatencyMs: 480,
    costThisMonth: 5.5,
    byModel: [
        { model: 'gpt-4o-mini', tokens: 100_000, cost: 10, calls: 30, avgLatencyMs: 500 },
        { model: 'local-llama3', tokens: 50_000, cost: 2.3456, calls: 12, avgLatencyMs: 400 },
    ],
    daily: [
        { day: '2026-07-01', tokens: 1000, cost: 0.1, calls: 3 },
        { day: '2026-07-02', tokens: 2000, cost: 0.2, calls: 5 },
    ],
    unattributedCalls: 0,
    isEmpty: false,
};

beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue(usageCheio);
    // Recharts mede o container; em jsdom o tamanho é 0 e os gráficos não desenham.
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('Billing', () => {
    it('renderiza sem erro e busca 30 dias por padrão', async () => {
        render(<Billing />);
        expect(screen.getByText('Consumo de IA')).toBeInTheDocument();
        await waitFor(() => expect(getMock).toHaveBeenCalledWith('/api/usage?days=30'));
    });

    it('exibe os totais e a tabela por modelo vindos da API', async () => {
        render(<Billing />);

        expect(await screen.findByText('US$ 12.35')).toBeInTheDocument();
        expect(screen.getByText('US$ 5.50')).toBeInTheDocument();
        expect(screen.getByText('480 ms')).toBeInTheDocument();
        expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
        expect(screen.getByText('local-llama3')).toBeInTheDocument();
    });

    it('recarrega ao trocar o período', async () => {
        const user = userEvent.setup();
        render(<Billing />);
        await waitFor(() => expect(getMock).toHaveBeenCalledWith('/api/usage?days=30'));

        await user.click(screen.getByRole('button', { name: '7d' }));
        await waitFor(() => expect(getMock).toHaveBeenCalledWith('/api/usage?days=7'));
    });

    it('mostra estado vazio quando não houve chamada de IA no período', async () => {
        getMock.mockResolvedValue({ ...usageCheio, isEmpty: true });
        render(<Billing />);
        expect(await screen.findByText('Nenhuma chamada de IA no período')).toBeInTheDocument();
    });

    it('mostra erro recuperável quando a API falha, com botão para tentar de novo', async () => {
        getMock.mockRejectedValue(new Error('Falha ao carregar consumo'));
        render(<Billing />);

        expect(await screen.findByText('Falha ao carregar consumo')).toBeInTheDocument();
        const retry = screen.getByRole('button', { name: 'Tentar novamente' });
        expect(retry).toBeInTheDocument();

        getMock.mockResolvedValue(usageCheio);
        const user = userEvent.setup();
        await user.click(retry);

        expect(await screen.findByText('US$ 12.35')).toBeInTheDocument();
    });

    it('mostra o loading inicial antes dos dados chegarem', () => {
        getMock.mockReturnValue(new Promise(() => {})); // nunca resolve
        render(<Billing />);
        expect(screen.getByText('Carregando consumo…')).toBeInTheDocument();
    });
});
