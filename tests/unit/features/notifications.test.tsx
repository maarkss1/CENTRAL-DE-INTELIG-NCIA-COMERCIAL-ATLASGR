import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';

import { Notifications } from '@/features/notifications/components/Notifications';
import { relativeTime } from '@/features/notifications/notifications.api';
import { BrandProvider } from '@/contexts/BrandContext';

const LIST_URL = '/api/notifications';

function render(ui: React.ReactElement) {
    return rtlRender(<BrandProvider>{ui}</BrandProvider>);
}

const naoLida = {
    id: 'n1', title: 'Lead chegou em Proposta', body: 'Transportes Vale',
    kind: 'Alerta' as const, entity: 'Lead', entityId: 'l1',
    readAt: null, createdAt: new Date().toISOString(),
    automation: { id: 'a1', name: 'Aviso de Proposta' },
};

/** `unread=1` na query string quando o filtro "não lidas" está ativo, senão sem query. */
let listCalls: boolean[];

function mockList(data: { items: unknown[]; unread: number }) {
    server.use(
        http.get(LIST_URL, ({ request }) => {
            listCalls.push(new URL(request.url).searchParams.get('unread') === '1');
            return HttpResponse.json({ success: true, data });
        }),
    );
}

beforeEach(() => {
    listCalls = [];
    mockList({ items: [], unread: 0 });
});

afterEach(() => { cleanup(); server.resetHandlers(); });

describe('relativeTime', () => {
    const agora = new Date('2026-07-31T12:00:00');

    it('mostra "agora" para menos de um minuto', () => {
        expect(relativeTime('2026-07-31T11:59:40', agora)).toBe('agora');
    });

    it('mostra minutos e horas', () => {
        expect(relativeTime('2026-07-31T11:30:00', agora)).toBe('há 30 min');
        expect(relativeTime('2026-07-31T09:00:00', agora)).toBe('há 3 h');
    });

    it('mostra "ontem" e dias', () => {
        expect(relativeTime('2026-07-30T10:00:00', agora)).toBe('ontem');
        expect(relativeTime('2026-07-26T10:00:00', agora)).toBe('há 5 dias');
    });

    it('cai para data cheia além de 30 dias', () => {
        expect(relativeTime('2026-05-01T10:00:00', agora)).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });
});

describe('Notificações', () => {
    it('mostra estado vazio', async () => {
        render(<Notifications />);
        expect(await screen.findByText('Nenhuma notificação ainda')).toBeTruthy();
    });

    it('lista a notificação com origem da automação', async () => {
        mockList({ items: [naoLida], unread: 1 });
        render(<Notifications />);

        expect(await screen.findByText('Lead chegou em Proposta')).toBeTruthy();
        expect(screen.getByText('Transportes Vale')).toBeTruthy();
        expect(screen.getByText('Aviso de Proposta')).toBeTruthy();
        expect(screen.getByText('1 não lida')).toBeTruthy();
    });

    it('marca como lida ao clicar e decrementa o contador', async () => {
        mockList({ items: [naoLida], unread: 1 });
        let markReadCalledWith: string | undefined;
        server.use(
            http.post(`${LIST_URL}/:id/read`, ({ params }) => {
                markReadCalledWith = String(params.id);
                return HttpResponse.json({ success: true, data: { id: params.id } });
            }),
        );
        const user = userEvent.setup();
        render(<Notifications />);

        await user.click(await screen.findByText('Lead chegou em Proposta'));
        await waitFor(() => expect(markReadCalledWith).toBe('n1'));
        await waitFor(() => expect(screen.getByText('Tudo em dia')).toBeTruthy());
    });

    it('reverte o contador quando marcar como lida falha', async () => {
        mockList({ items: [naoLida], unread: 1 });
        let markReadCalled = false;
        server.use(
            http.post(`${LIST_URL}/:id/read`, () => {
                markReadCalled = true;
                return HttpResponse.json({ success: false, error: 'sem conexão' }, { status: 500 });
            }),
        );
        const user = userEvent.setup();
        render(<Notifications />);

        await user.click(await screen.findByText('Lead chegou em Proposta'));
        await waitFor(() => expect(markReadCalled).toBe(true));
        await waitFor(() => expect(screen.getByText('1 não lida')).toBeTruthy());
    });

    it('alterna para o filtro de não lidas', async () => {
        const user = userEvent.setup();
        render(<Notifications />);
        await waitFor(() => expect(listCalls).toContain(false));

        await user.click(screen.getByRole('button', { name: 'Não lidas' }));
        await waitFor(() => expect(listCalls).toContain(true));
    });

    it('exibe erro recuperável', async () => {
        server.use(
            http.get(LIST_URL, () => HttpResponse.json({ success: false, error: 'Banco indisponível' }, { status: 500 })),
        );
        render(<Notifications />);
        expect(await screen.findByText('Banco indisponível')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy();
    });
});
