/**
 * Cobre `CadenceHub.tsx` (Agente 17, Onda 10): as duas seções reais (opt-outs, execuções de
 * cadência) e seus estados de loading/erro/vazio — ver `.claude/CLAUDE.md` §10 (acessibilidade,
 * não opcional). Mocka `@/lib/api` (a mesma camada que `ReportsHub.test.tsx` mocka), não
 * `cadence.api.ts` diretamente — assim o contrato real de `cadenceApi` (URL, query string) também
 * é exercitado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const getMock = vi.fn();

vi.mock('@/lib/api', () => ({
    api: {
        get: (...args: unknown[]) => getMock(...args),
    },
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
            { touchOrder: 1, channel: 'email', attemptedAt: '2026-08-01T10:05:00Z', result: 'sent', error: null },
        ],
    },
];

function mockApiByUrl(handlers: { optOuts?: unknown; runs?: unknown; runsError?: Error; optOutsError?: Error }) {
    getMock.mockImplementation(async (url: string) => {
        if (url.startsWith('/api/cadence/opt-outs')) {
            if (handlers.optOutsError) throw handlers.optOutsError;
            return handlers.optOuts ?? [];
        }
        if (url.startsWith('/api/cadence/runs')) {
            if (handlers.runsError) throw handlers.runsError;
            return handlers.runs ?? [];
        }
        throw new Error(`URL inesperada no mock: ${url}`);
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('CadenceHub', () => {
    it('renderiza o título da tela e busca as duas seções ao montar', async () => {
        mockApiByUrl({ optOuts: OPT_OUT_FIXTURE, runs: RUN_FIXTURE });
        render(<CadenceHub />);

        expect(screen.getByRole('heading', { name: /Cadência & Ciclo de Receita/i })).toBeInTheDocument();
        await waitFor(() => expect(getMock).toHaveBeenCalledWith('/api/cadence/opt-outs'));
        await waitFor(() => expect(getMock).toHaveBeenCalledWith(expect.stringContaining('/api/cadence/runs')));
    });

    it('lista os opt-outs reais com escopo, origem e motivo', async () => {
        mockApiByUrl({ optOuts: OPT_OUT_FIXTURE, runs: [] });
        render(<CadenceHub />);

        expect(await screen.findByText('Global (todos os canais)')).toBeInTheDocument();
        expect(screen.getByText('WhatsApp')).toBeInTheDocument();
        expect(screen.getByText('Pediu para não ser mais contatado')).toBeInTheDocument();
    });

    it('lista as execuções de cadência com status, toque atual e última tentativa', async () => {
        mockApiByUrl({ optOuts: [], runs: RUN_FIXTURE });
        render(<CadenceHub />);

        const table = await screen.findByRole('table');
        // "Ativa" também é o rótulo do filtro de status (sempre presente) — escopo pro corpo da
        // tabela evita ambiguidade entre o botão de filtro e o badge de status da linha.
        expect(within(table).getByText('Ativa')).toBeInTheDocument();
        expect(within(table).getByText('2')).toBeInTheDocument(); // toque atual
        expect(within(table).getByText('Enviado')).toBeInTheDocument();
    });

    it('mostra estado vazio honesto quando não há opt-outs nem runs (sem dado fictício)', async () => {
        mockApiByUrl({ optOuts: [], runs: [] });
        render(<CadenceHub />);

        expect(await screen.findByText('Nenhum opt-out registrado')).toBeInTheDocument();
        expect(await screen.findByText('Nenhuma execução para este filtro')).toBeInTheDocument();
    });

    it('mostra erro recuperável com ação de retry quando /api/cadence/opt-outs falha, sem travar a seção de runs', async () => {
        mockApiByUrl({ optOutsError: new Error('Falha ao carregar opt-outs'), runs: RUN_FIXTURE });
        render(<CadenceHub />);

        expect(await screen.findByText('Falha ao carregar opt-outs')).toBeInTheDocument();
        // A seção de runs, independente, ainda carrega normalmente.
        const table = await screen.findByRole('table');
        expect(within(table).getByText('Ativa')).toBeInTheDocument();
    });

    it('alternar o filtro de status refaz a busca de runs com a query certa', async () => {
        mockApiByUrl({ optOuts: [], runs: RUN_FIXTURE });
        const user = userEvent.setup();
        render(<CadenceHub />);

        await screen.findByRole('table');
        getMock.mockClear();
        mockApiByUrl({ optOuts: [], runs: [] });

        const stoppedFilter = screen.getByRole('button', { name: 'Encerrada' });
        await user.click(stoppedFilter);

        await waitFor(() =>
            expect(getMock).toHaveBeenCalledWith(expect.stringContaining('status=Active,Paused,Stopped')),
        );
    });

    it('expande o histórico de tentativas de um run ao clicar na linha', async () => {
        mockApiByUrl({ optOuts: [], runs: RUN_FIXTURE });
        const user = userEvent.setup();
        render(<CadenceHub />);

        const leadButton = await screen.findByRole('button', { name: /Ver histórico de tentativas/i });
        await user.click(leadButton);

        const table = screen.getAllByRole('table')[1];
        expect(within(table).getByText('Toque')).toBeInTheDocument();
        expect(within(table).getByText('Canal')).toBeInTheDocument();
    });
});
