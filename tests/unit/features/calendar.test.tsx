import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';

import { Calendar } from '@/features/calendar/components/Calendar';
import { BrandProvider } from '@/contexts/BrandContext';

const ACTIVITIES_URL = '/api/activities';

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

/** `[from, to]` de cada chamada a GET /api/activities, na ordem em que chegaram. */
let rangeCalls: Array<[Date, Date]>;

function mockRange(items: unknown[]) {
    server.use(
        http.get(ACTIVITIES_URL, ({ request }) => {
            const url = new URL(request.url);
            const from = new Date(url.searchParams.get('from')!);
            const to = new Date(url.searchParams.get('to')!);
            rangeCalls.push([from, to]);
            return HttpResponse.json({ success: true, data: items });
        }),
    );
}

function mockRangeError(message: string) {
    server.use(
        http.get(ACTIVITIES_URL, () => HttpResponse.json({ success: false, error: message }, { status: 500 })),
    );
}

beforeEach(() => {
    rangeCalls = [];
    mockRange([]);
});

afterEach(() => {
    cleanup();
    server.resetHandlers();
});

describe('Calendário', () => {
    it('carrega o intervalo de 42 dias da grade do mês', async () => {
        render(<Calendar />);
        await waitFor(() => expect(rangeCalls.length).toBeGreaterThan(0));

        const [from, to] = rangeCalls[0];
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
        mockRange([atividadeNesteMes()]);
        render(<Calendar />);

        expect(await screen.findByText('Transportes Vale')).toBeTruthy();
        expect(screen.getByText('14:30')).toBeTruthy();
        expect(screen.getByText('Reunião')).toBeTruthy();
    });

    it('navega entre meses e recarrega o período', async () => {
        const user = userEvent.setup();
        render(<Calendar />);
        await waitFor(() => expect(rangeCalls.length).toBe(1));

        const primeiroInicio = rangeCalls[0][0];
        await user.click(screen.getByLabelText('Próximo mês'));

        await waitFor(() => expect(rangeCalls.length).toBe(2));
        const segundoInicio = rangeCalls[1][0];
        expect(segundoInicio.getTime()).toBeGreaterThan(primeiroInicio.getTime());
    });

    it('abre o detalhe ao clicar na atividade', async () => {
        mockRange([atividadeNesteMes()]);
        const user = userEvent.setup();
        render(<Calendar />);

        await user.click(await screen.findByLabelText(/Reunião — Transportes Vale/));
        expect(await screen.findByText('Levar proposta de GR.')).toBeTruthy();
        expect(screen.getByText('Marcelo')).toBeTruthy();
    });

    it('conclui a atividade e envia o novo status', async () => {
        mockRange([atividadeNesteMes()]);
        let updateCalledWith: { id: string; patch: unknown } | undefined;
        server.use(
            http.put(`${ACTIVITIES_URL}/:id`, async ({ params, request }) => {
                updateCalledWith = { id: String(params.id), patch: await request.json() };
                return HttpResponse.json({ success: true, data: {} });
            }),
        );
        const user = userEvent.setup();
        render(<Calendar />);

        await user.click(await screen.findByLabelText(/Reunião — Transportes Vale/));
        await user.click(screen.getByRole('button', { name: /Concluir/ }));

        await waitFor(() => expect(updateCalledWith).toEqual({ id: 'act-1', patch: { status: 'Concluída' } }));
    });

    it('reverte o status na tela quando a API recusa', async () => {
        mockRange([atividadeNesteMes()]);
        let updateCalled = false;
        server.use(
            http.put(`${ACTIVITIES_URL}/:id`, () => {
                updateCalled = true;
                return HttpResponse.json({ success: false, error: 'sem permissão' }, { status: 500 });
            }),
        );
        const user = userEvent.setup();
        render(<Calendar />);

        await user.click(await screen.findByLabelText(/Reunião — Transportes Vale/));
        await user.click(screen.getByRole('button', { name: /Concluir/ }));

        await waitFor(() => expect(updateCalled).toBe(true));
        // O detalhe volta a mostrar o status original — reverter só a grade deixaria o diálogo
        // afirmando um status que o servidor recusou.
        const status = screen.getByText('Status').closest('div')!;
        await waitFor(() => expect(within(status).getByText('Pendente')).toBeTruthy());
        // E o botão "Concluir" continua disponível, já que a conclusão não aconteceu.
        expect(screen.getByRole('button', { name: /Concluir/ })).toBeTruthy();
    });

    it('exibe erro recuperável quando a listagem falha', async () => {
        mockRangeError('Banco indisponível');
        render(<Calendar />);

        expect(await screen.findByText('Banco indisponível')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy();
    });
});
