/**
 * Cobre o feed de eventos em tempo real do dashboard (SSE de /api/events). Antes desta correção,
 * uma falha de conexão (token expirado, rede fora, 5xx) só ia pro `console.error` — a tela
 * continuava mostrando "Nenhuma atividade recente.", indistinguível de "conectado e sem eventos
 * ainda" (achado da auditoria Onda 1/Roadmap v2 — Agente 02). Este teste garante que a falha vira
 * um estado de erro visível e anunciável, com ação de retry real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import { RealtimeFeed } from '@/features/dashboard/components/RealtimeFeed';

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

describe('RealtimeFeed', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('mostra estado de erro visível (não só console) quando a conexão SSE falha, com ação de retry', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
        vi.stubGlobal('fetch', fetchMock);

        render(<RealtimeFeed />);

        expect(await screen.findByText('Feed em tempo real desconectado.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
        // Nunca mostra o texto de "vazio real" (sem eventos) junto com o de erro — são estados
        // distintos, não a mesma mensagem genérica.
        expect(screen.queryByText('Nenhuma atividade recente.')).not.toBeInTheDocument();

        expect(fetchMock).toHaveBeenCalledTimes(1);

        await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });

    it('mostra "Nenhuma atividade recente." quando conectado e sem eventos (sem confundir com erro)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(sseResponse([]));
        vi.stubGlobal('fetch', fetchMock);

        render(<RealtimeFeed />);

        expect(await screen.findByText('Nenhuma atividade recente.')).toBeInTheDocument();
        expect(screen.queryByText('Feed em tempo real desconectado.')).not.toBeInTheDocument();
    });

    it('renderiza eventos reais recebidos via SSE', async () => {
        const frame = 'event: crm_event\ndata: {"type":"DEAL_WON"}\n\n';
        const fetchMock = vi.fn().mockResolvedValue(sseResponse([frame]));
        vi.stubGlobal('fetch', fetchMock);

        render(<RealtimeFeed />);

        expect(await screen.findByText('Negócio ganho!')).toBeInTheDocument();
    });
});
