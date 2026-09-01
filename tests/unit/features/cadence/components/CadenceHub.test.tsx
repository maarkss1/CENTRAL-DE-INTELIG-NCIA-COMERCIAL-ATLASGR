/**
 * Cobre `CadenceHub.tsx` (Agente 17, Onda 10): as três seções reais (sequências, opt-outs,
 * execuções de cadência) e seus estados de loading/erro/vazio — ver `.claude/CLAUDE.md` §10
 * (acessibilidade, não opcional). Mocka `@/lib/api` (a mesma camada que `ReportsHub.test.tsx`
 * mocka), não `cadence.api.ts` diretamente — assim o contrato real de `cadenceApi` (URL, query
 * string, verbo) também é exercitado.
 *
 * Seção "Sequências" e a ação "Encerrar sequência" (`POST /sequences/:id/deactivate`) adicionadas
 * no Piloto 016 (achado fora de escopo, backend novo) — ver `cadence.routes.ts` e
 * `application/sequenceService.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('@/lib/api', () => ({
    api: {
        get: (...args: unknown[]) => getMock(...args),
        post: (...args: unknown[]) => postMock(...args),
    },
}));

let authMockUser: { role: string } | null = { role: 'ADMIN' };
vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ currentUser: authMockUser }),
}));

import { CadenceHub } from '@/features/cadence/components/CadenceHub';

const OPT_OUT_FIXTURE = [
    {
        id: 'opt-1',
        organizationId: 'org-1',
        scope: 'global',
        leadId: 'lead-abc12345',
        email: 'lead@empresa.com',
        phoneE164: '+5511999998888',
        originChannel: 'whatsapp',
        reason: 'Pediu para não ser mais contatado',
        evidence: 'transcrição real',
        requestedBy: null,
        createdAt: '2026-08-10T12:00:00Z',
    },
];

const RUN_FIXTURE = [
    {
        id: 'run-1',
        organizationId: 'org-1',
        leadId: 'lead-def67890',
        sequenceId: 'seq-1',
        status: 'active',
        currentTouchOrder: 2,
        stopReason: null,
        startedAt: '2026-08-01T10:00:00Z',
        lastTouchAt: '2026-08-01T10:05:00Z',
        pausedAt: null,
        stoppedAt: null,
        attempts: [
            { touchOrder: 1, attemptNumber: 1, channel: 'email', attemptedAt: '2026-08-01T10:05:00Z', result: 'sent', error: null },
        ],
    },
];

const SEQUENCE_FIXTURE = [
    {
        id: 'seq-1',
        organizationId: 'org-1',
        name: 'E-mail → WhatsApp (follow-up padrão)',
        description: 'Sequência padrão de follow-up',
        touches: [
            { order: 1, channel: 'email', delayHoursFromPrevious: 0, templateRef: 'Olá!' },
            { order: 2, channel: 'whatsapp', delayHoursFromPrevious: 24, templateRef: 'Oi de novo!' },
        ],
        active: true,
        createdAt: '2026-08-01T09:00:00Z',
        updatedAt: '2026-08-01T09:00:00Z',
    },
];

function mockApiByUrl(handlers: {
    optOuts?: unknown;
    runs?: unknown;
    sequences?: unknown;
    runsError?: Error;
    optOutsError?: Error;
    sequencesError?: Error;
}) {
    getMock.mockImplementation(async (url: string) => {
        if (url.startsWith('/api/cadence/opt-outs')) {
            if (handlers.optOutsError) throw handlers.optOutsError;
            return handlers.optOuts ?? [];
        }
        if (url.startsWith('/api/cadence/runs')) {
            if (handlers.runsError) throw handlers.runsError;
            return handlers.runs ?? [];
        }
        if (url.startsWith('/api/cadence/sequences')) {
            if (handlers.sequencesError) throw handlers.sequencesError;
            return handlers.sequences ?? [];
        }
        throw new Error(`URL inesperada no mock: ${url}`);
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    authMockUser = { role: 'ADMIN' };
});

afterEach(() => cleanup());

describe('CadenceHub', () => {
    it('renderiza o título da tela e busca as três seções ao montar', async () => {
        mockApiByUrl({ optOuts: OPT_OUT_FIXTURE, runs: RUN_FIXTURE, sequences: SEQUENCE_FIXTURE });
        render(<CadenceHub />);

        expect(screen.getByRole('heading', { name: /Cadência & Ciclo de Receita/i })).toBeInTheDocument();
        await waitFor(() => expect(getMock).toHaveBeenCalledWith('/api/cadence/opt-outs'));
        await waitFor(() => expect(getMock).toHaveBeenCalledWith(expect.stringContaining('/api/cadence/runs')));
        await waitFor(() => expect(getMock).toHaveBeenCalledWith('/api/cadence/sequences'));
    });

    it('lista os opt-outs reais com escopo, origem e motivo', async () => {
        mockApiByUrl({ optOuts: OPT_OUT_FIXTURE, runs: [], sequences: [] });
        render(<CadenceHub />);

        expect(await screen.findByText('Global (todos os canais)')).toBeInTheDocument();
        expect(screen.getByText('WhatsApp')).toBeInTheDocument();
        expect(screen.getByText('Pediu para não ser mais contatado')).toBeInTheDocument();
    });

    it('lista as execuções de cadência com status, toque atual e última tentativa', async () => {
        mockApiByUrl({ optOuts: [], runs: RUN_FIXTURE, sequences: [] });
        render(<CadenceHub />);

        const table = await screen.findByRole('table');
        // "Ativa" também é o rótulo do filtro de status (sempre presente) — escopo pro corpo da
        // tabela evita ambiguidade entre o botão de filtro e o badge de status da linha.
        expect(within(table).getByText('Ativa')).toBeInTheDocument();
        expect(within(table).getByText('2')).toBeInTheDocument(); // toque atual
        expect(within(table).getByText('Enviado')).toBeInTheDocument();
    });

    it('mostra estado vazio honesto quando não há opt-outs, runs nem sequências (sem dado fictício)', async () => {
        mockApiByUrl({ optOuts: [], runs: [], sequences: [] });
        render(<CadenceHub />);

        expect(await screen.findByText('Nenhum opt-out registrado')).toBeInTheDocument();
        expect(await screen.findByText('Nenhuma execução para este filtro')).toBeInTheDocument();
        expect(await screen.findByText('Nenhuma sequência ativa')).toBeInTheDocument();
    });

    it('mostra erro recuperável com ação de retry quando /api/cadence/opt-outs falha, sem travar a seção de runs', async () => {
        mockApiByUrl({ optOutsError: new Error('Falha ao carregar opt-outs'), runs: RUN_FIXTURE, sequences: [] });
        render(<CadenceHub />);

        expect(await screen.findByText('Falha ao carregar opt-outs')).toBeInTheDocument();
        // A seção de runs, independente, ainda carrega normalmente.
        const table = await screen.findByRole('table');
        expect(within(table).getByText('Ativa')).toBeInTheDocument();
    });

    it('alternar o filtro de status refaz a busca de runs com a query certa', async () => {
        mockApiByUrl({ optOuts: [], runs: RUN_FIXTURE, sequences: [] });
        const user = userEvent.setup();
        render(<CadenceHub />);

        await screen.findByRole('table');
        getMock.mockClear();
        mockApiByUrl({ optOuts: [], runs: [], sequences: [] });

        const stoppedFilter = screen.getByRole('button', { name: 'Encerrada' });
        await user.click(stoppedFilter);

        await waitFor(() =>
            expect(getMock).toHaveBeenCalledWith(expect.stringContaining('status=Active,Paused,Stopped')),
        );
    });

    it('expande o histórico de tentativas de um run ao clicar na linha', async () => {
        mockApiByUrl({ optOuts: [], runs: RUN_FIXTURE, sequences: [] });
        const user = userEvent.setup();
        render(<CadenceHub />);

        const leadButton = await screen.findByRole('button', { name: /Ver histórico de tentativas/i });
        await user.click(leadButton);

        const table = screen.getAllByRole('table')[1];
        expect(within(table).getByText('Toque')).toBeInTheDocument();
        expect(within(table).getByText('Canal')).toBeInTheDocument();
    });

    describe('Sequências', () => {
        it('lista as sequências ativas com nome e contagem de toques', async () => {
            mockApiByUrl({ optOuts: [], runs: [], sequences: SEQUENCE_FIXTURE });
            render(<CadenceHub />);

            expect(await screen.findByText('E-mail → WhatsApp (follow-up padrão)')).toBeInTheDocument();
            expect(screen.getByText('Sequência padrão de follow-up')).toBeInTheDocument();
            expect(screen.getByText('2')).toBeInTheDocument(); // 2 toques
        });

        it('mostra o botão "Encerrar sequência" para um papel com permissão de escrita (ADMIN)', async () => {
            authMockUser = { role: 'ADMIN' };
            mockApiByUrl({ optOuts: [], runs: [], sequences: SEQUENCE_FIXTURE });
            render(<CadenceHub />);

            expect(
                await screen.findByRole('button', { name: /Encerrar sequência E-mail/i }),
            ).toBeInTheDocument();
        });

        it('oculta o botão "Encerrar sequência" para um papel sem permissão de escrita (VISUALIZADOR)', async () => {
            authMockUser = { role: 'VISUALIZADOR' };
            mockApiByUrl({ optOuts: [], runs: [], sequences: SEQUENCE_FIXTURE });
            render(<CadenceHub />);

            await screen.findByText('E-mail → WhatsApp (follow-up padrão)');
            expect(
                screen.queryByRole('button', { name: /Encerrar sequência/i }),
            ).not.toBeInTheDocument();
        });

        it('encerra a sequência ao confirmar, chama a rota certa e recarrega a lista', async () => {
            mockApiByUrl({ optOuts: [], runs: [], sequences: SEQUENCE_FIXTURE });
            postMock.mockResolvedValue({ ...SEQUENCE_FIXTURE[0], active: false });
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
            const user = userEvent.setup();
            render(<CadenceHub />);

            const deactivateButton = await screen.findByRole('button', {
                name: /Encerrar sequência E-mail/i,
            });
            await user.click(deactivateButton);

            expect(confirmSpy).toHaveBeenCalled();
            await waitFor(() =>
                expect(postMock).toHaveBeenCalledWith('/api/cadence/sequences/seq-1/deactivate', {}),
            );
            // Recarrega a lista de sequências depois de encerrar com sucesso.
            await waitFor(() =>
                expect(getMock.mock.calls.filter((c) => c[0] === '/api/cadence/sequences').length).toBeGreaterThan(1),
            );

            confirmSpy.mockRestore();
        });

        it('não chama a rota de encerrar quando o usuário cancela a confirmação', async () => {
            mockApiByUrl({ optOuts: [], runs: [], sequences: SEQUENCE_FIXTURE });
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
            const user = userEvent.setup();
            render(<CadenceHub />);

            const deactivateButton = await screen.findByRole('button', {
                name: /Encerrar sequência E-mail/i,
            });
            await user.click(deactivateButton);

            expect(confirmSpy).toHaveBeenCalled();
            expect(postMock).not.toHaveBeenCalled();

            confirmSpy.mockRestore();
        });
    });
});
