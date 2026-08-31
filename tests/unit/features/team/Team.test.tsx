import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';

/**
 * `Team.tsx` (`/app/team`) não tinha nenhum teste antes do Piloto 024. Cobre o essencial da tela e
 * o achado real deste piloto: a ação de desbloqueio de conta (`lockedUntil`/`failedLoginAttempts`,
 * campos reais que existiam no schema mas nunca chegavam à UI).
 */

const useAuthMock = vi.fn(() => ({ currentUser: { id: 'admin-1', role: 'ADMIN' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => useAuthMock() }));

import { Team } from '@/features/team/components/Team';

const TEAM_URL = '/api/team';

function render(ui: React.ReactElement) {
    return rtlRender(ui);
}

const admin = {
    id: 'admin-1',
    name: 'Ana Admin',
    email: 'ana@atlasgr.com.br',
    role: 'ADMIN',
    mustChangePassword: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    lockedUntil: null,
    failedLoginAttempts: 0,
};

const bloqueado = {
    id: 'sdr-1',
    name: 'Sérgio SDR',
    email: 'sergio@atlasgr.com.br',
    role: 'SDR',
    mustChangePassword: false,
    createdAt: '2026-07-02T00:00:00.000Z',
    lockedUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
    failedLoginAttempts: 5,
};

function mockList(members: unknown[]) {
    server.use(
        http.get(TEAM_URL, () =>
            HttpResponse.json({
                success: true,
                data: { members, assignableRoles: ['ADMIN', 'GESTOR', 'CLOSER', 'SDR', 'VISUALIZADOR'] },
            }),
        ),
    );
}

beforeEach(() => {
    mockList([admin]);
    useAuthMock.mockReturnValue({ currentUser: { id: 'admin-1', role: 'ADMIN' } });
});

afterEach(() => {
    cleanup();
    server.resetHandlers();
});

describe('Equipe', () => {
    it('lista os usuários da organização', async () => {
        render(<Team />);
        expect(await screen.findByText('Ana Admin')).toBeTruthy();
        expect(screen.getByText('ana@atlasgr.com.br')).toBeTruthy();
    });

    it('o botão de excluir a própria conta fica desabilitado', async () => {
        render(<Team />);
        await screen.findByText('Ana Admin');
        const deleteButton = screen.getByLabelText('Você não pode remover a própria conta');
        expect((deleteButton as HTMLButtonElement).disabled).toBe(true);
    });

    it('mostra o badge "bloqueado até" e o botão de desbloquear só para usuário travado (achado real do Piloto 024)', async () => {
        mockList([admin, bloqueado]);
        render(<Team />);

        await screen.findByText('Sérgio SDR');
        expect(screen.getByText(/bloqueado até/)).toBeTruthy();
        expect(screen.getByLabelText('Desbloquear acesso de Sérgio SDR')).toBeTruthy();
        // Ana (não bloqueada) não tem o botão de desbloquear.
        expect(screen.queryByLabelText('Desbloquear acesso de Ana Admin')).toBeNull();
    });

    it('desbloqueia um usuário e reflete lockedUntil:null na tela', async () => {
        mockList([bloqueado]);
        let unlockCalledWith: string | undefined;
        server.use(
            http.post(`${TEAM_URL}/:id/unlock`, ({ params }) => {
                unlockCalledWith = String(params.id);
                return HttpResponse.json({
                    success: true,
                    data: { member: { ...bloqueado, lockedUntil: null, failedLoginAttempts: 0 } },
                });
            }),
        );
        const user = userEvent.setup();
        render(<Team />);

        await screen.findByText('Sérgio SDR');
        await user.click(screen.getByLabelText('Desbloquear acesso de Sérgio SDR'));

        await waitFor(() => expect(unlockCalledWith).toBe('sdr-1'));
        await waitFor(() => expect(screen.queryByText(/bloqueado até/)).toBeNull());
    });

    it('cria um novo usuário e mostra a senha temporária', async () => {
        let createBody: unknown;
        server.use(
            http.post(TEAM_URL, async ({ request }) => {
                createBody = await request.json();
                return HttpResponse.json(
                    {
                        success: true,
                        data: {
                            member: { ...bloqueado, id: 'novo-1', name: 'Novo Usuário', lockedUntil: null },
                            tempPassword: 'Xy9!A1abcdef',
                        },
                    },
                    { status: 201 },
                );
            }),
        );
        const user = userEvent.setup();
        render(<Team />);
        await screen.findByText('Ana Admin');

        await user.type(screen.getByLabelText('Nome'), 'Novo Usuário');
        await user.type(screen.getByLabelText('E-mail corporativo'), 'novo@atlasgr.com.br');
        await user.click(screen.getByRole('button', { name: /Criar usuário/ }));

        await waitFor(() =>
            expect(createBody).toEqual({ name: 'Novo Usuário', email: 'novo@atlasgr.com.br', role: 'SDR' }),
        );
        expect(await screen.findByText('Xy9!A1abcdef')).toBeTruthy();
    });
});
