import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const rangeMock = vi.fn();
const updateMock = vi.fn();

vi.mock('@/features/calendar/calendar.api', async () => {
    const actual = await vi.importActual<typeof import('@/features/calendar/calendar.api')>(
        '@/features/calendar/calendar.api',
    );
    return {
        ...actual,
        calendarApi: {
            range: (f: Date, t: Date) => rangeMock(f, t),
            update: (id: string, patch: unknown) => updateMock(id, patch),
        },
    };
});

import { Calendar } from '@/features/calendar/components/Calendar';
import { BrandProvider } from '@/contexts/BrandContext';

function render(ui: React.ReactElement) {
    return rtlRender(<BrandProvider>{ui}</BrandProvider>);
}

/** Uma atividade no dia 10 do mês corrente, às 14h30. */
function atividadeNesteMes(overrides: Record<string, unknown> = {}) {
    const hoje = new Date();
    const data = new Date(hoje.getFullYear(), hoje.getMonth(), 10, 14, 30);
    return {
        id: 'act-1',
        type: 'Reunião',
        owner: 'Marcelo',
        date: data.toISOString(),
        time: null,
        status: 'Pendente',
        observations: 'Levar proposta de GR.',
        leadId: 'lead-1',
        lead: { id: 'lead-1', company: { tradeName: 'Transportes Vale' }, contact: null },
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    rangeMock.mockResolvedValue([]);
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('Calendário', () => {
    it('carrega o intervalo de 42 dias da grade do mês', async () => {
        render(<Calendar />);
        await waitFor(() => expect(rangeMock).toHaveBeenCalled());

        const [from, to] = rangeMock.mock.calls[0];
        const dias = Math.round((to.getTime() - from.getTime()) / 86_400_000);
        expect(dias).toBe(42);
        // A grade sempre abre num domingo.
        expect(from.getDay()).toBe(0);
    });

    it('mostra estado vazio quando não há atividades no mês', async () => {
        render(<Calendar />);
        expect(await screen.findByText('Nenhuma atividade neste mês')).toBeTruthy();
    });

    it('renderiza a atividade com horário, tipo e empresa', async () => {
        rangeMock.mockResolvedValue([atividadeNesteMes()]);
        render(<Calendar />);

        expect(await screen.findByText('Transportes Vale')).toBeTruthy();
        expect(screen.getByText('14:30')).toBeTruthy();
        expect(screen.getByText('Reunião')).toBeTruthy();
    });

    it('navega entre meses e recarrega o período', async () => {
        const user = userEvent.setup();
        render(<Calendar />);
        await waitFor(() => expect(rangeMock).toHaveBeenCalledTimes(1));

        const primeiroInicio = rangeMock.mock.calls[0][0] as Date;
        await user.click(screen.getByLabelText('Próximo mês'));

        await waitFor(() => expect(rangeMock).toHaveBeenCalledTimes(2));
        const segundoInicio = rangeMock.mock.calls[1][0] as Date;
        expect(segundoInicio.getTime()).toBeGreaterThan(primeiroInicio.getTime());
    });

    it('abre o detalhe ao clicar na atividade', async () => {
        rangeMock.mockResolvedValue([atividadeNesteMes()]);
        const user = userEvent.setup();
        render(<Calendar />);

        await user.click(await screen.findByLabelText(/Reunião — Transportes Vale/));
        expect(await screen.findByText('Levar proposta de GR.')).toBeTruthy();
        expect(screen.getByText('Marcelo')).toBeTruthy();
    });

    it('conclui a atividade e envia o novo status', async () => {
        rangeMock.mockResolvedValue([atividadeNesteMes()]);
        updateMock.mockResolvedValue({});
        const user = userEvent.setup();
        render(<Calendar />);

        await user.click(await screen.findByLabelText(/Reunião — Transportes Vale/));
        await user.click(screen.getByRole('button', { name: /Concluir/ }));

        await waitFor(() => expect(updateMock).toHaveBeenCalledWith('act-1', { status: 'Concluída' }));
    });

    it('reverte o status na tela quando a API recusa', async () => {
        rangeMock.mockResolvedValue([atividadeNesteMes()]);
        updateMock.mockRejectedValue(new Error('sem permissão'));
        const user = userEvent.setup();
        render(<Calendar />);

        await user.click(await screen.findByLabelText(/Reunião — Transportes Vale/));
        await user.click(screen.getByRole('button', { name: /Concluir/ }));

        await waitFor(() => expect(updateMock).toHaveBeenCalled());
        // O detalhe volta a mostrar o status original — reverter só a grade deixaria o diálogo
        // afirmando um status que o servidor recusou.
        const status = screen.getByText('Status').closest('div')!;
        await waitFor(() => expect(within(status).getByText('Pendente')).toBeTruthy());
        // E o botão "Concluir" continua disponível, já que a conclusão não aconteceu.
        expect(screen.getByRole('button', { name: /Concluir/ })).toBeTruthy();
    });

    it('exibe erro recuperável quando a listagem falha', async () => {
        rangeMock.mockRejectedValue(new Error('Banco indisponível'));
        render(<Calendar />);

        expect(await screen.findByText('Banco indisponível')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy();
    });
});
