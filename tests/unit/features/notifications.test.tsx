import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listMock = vi.fn();
const markReadMock = vi.fn();
const markAllReadMock = vi.fn();
const removeMock = vi.fn();

vi.mock('@/features/notifications/notifications.api', async () => {
    const actual = await vi.importActual<typeof import('@/features/notifications/notifications.api')>(
        '@/features/notifications/notifications.api',
    );
    return {
        ...actual,
        notificationsApi: {
            list: (u: boolean) => listMock(u),
            markRead: (id: string) => markReadMock(id),
            markAllRead: () => markAllReadMock(),
            remove: (id: string) => removeMock(id),
        },
    };
});

import { Notifications } from '@/features/notifications/components/Notifications';
import { relativeTime } from '@/features/notifications/notifications.api';
import { BrandProvider } from '@/contexts/BrandContext';

function render(ui: React.ReactElement) {
    return rtlRender(<BrandProvider>{ui}</BrandProvider>);
}

const naoLida = {
    id: 'n1', title: 'Lead chegou em Proposta', body: 'Transportes Vale',
    kind: 'Alerta' as const, entity: 'Lead', entityId: 'l1',
    readAt: null, createdAt: new Date().toISOString(),
    automation: { id: 'a1', name: 'Aviso de Proposta' },
};

beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue({ items: [], unread: 0 });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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
        listMock.mockResolvedValue({ items: [naoLida], unread: 1 });
        render(<Notifications />);

        expect(await screen.findByText('Lead chegou em Proposta')).toBeTruthy();
        expect(screen.getByText('Transportes Vale')).toBeTruthy();
        expect(screen.getByText('Aviso de Proposta')).toBeTruthy();
        expect(screen.getByText('1 não lida')).toBeTruthy();
    });

    it('marca como lida ao clicar e decrementa o contador', async () => {
        listMock.mockResolvedValue({ items: [naoLida], unread: 1 });
        markReadMock.mockResolvedValue({ id: 'n1' });
        const user = userEvent.setup();
        render(<Notifications />);

        await user.click(await screen.findByText('Lead chegou em Proposta'));
        await waitFor(() => expect(markReadMock).toHaveBeenCalledWith('n1'));
        await waitFor(() => expect(screen.getByText('Tudo em dia')).toBeTruthy());
    });

    it('reverte o contador quando marcar como lida falha', async () => {
        listMock.mockResolvedValue({ items: [naoLida], unread: 1 });
        markReadMock.mockRejectedValue(new Error('sem conexão'));
        const user = userEvent.setup();
        render(<Notifications />);

        await user.click(await screen.findByText('Lead chegou em Proposta'));
        await waitFor(() => expect(markReadMock).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByText('1 não lida')).toBeTruthy());
    });

    it('alterna para o filtro de não lidas', async () => {
        const user = userEvent.setup();
        render(<Notifications />);
        await waitFor(() => expect(listMock).toHaveBeenCalledWith(false));

        await user.click(screen.getByRole('button', { name: 'Não lidas' }));
        await waitFor(() => expect(listMock).toHaveBeenCalledWith(true));
    });

    it('exibe erro recuperável', async () => {
        listMock.mockRejectedValue(new Error('Banco indisponível'));
        render(<Notifications />);
        expect(await screen.findByText('Banco indisponível')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy();
    });
});
