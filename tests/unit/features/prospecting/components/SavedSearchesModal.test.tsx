/**
 * Onda 43: antes desta correção, "Executar" numa busca salva descartava os candidatos que
 * `/saved-searches/:id/run` já tinha encontrado — o componente pai reaplicava só o critério e
 * disparava uma SEGUNDA busca do zero (clique programático no botão de descoberta) pra conseguir
 * o mesmo resultado que a API já tinha devolvido de graça. Este teste prova que `onApplyCriteria`
 * agora recebe os candidatos reais da resposta, sem re-buscar nada.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('@/lib/api', () => ({
    api: {
        get: (...args: unknown[]) => getMock(...args),
        post: (...args: unknown[]) => postMock(...args),
        delete: vi.fn(),
    },
}));

vi.mock('@/lib/toast', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

import { SavedSearchesModal } from '@/features/prospecting/components/SavedSearchesModal';

const SAVED_SEARCH = {
    id: 'search-1',
    name: 'Frotas SP',
    criteria: { segmento: 'transporte', estado: 'SP' },
    schedule: null,
    lastRunAt: null,
    nextRunAt: null,
    leadsDiscovered: 3,
    createdAt: '2026-08-01T00:00:00Z',
};

const CANDIDATES = [
    { tradeName: 'Transportes Alpha', legalNameGuess: null, cnpjGuess: null, segment: 'transporte', size: 'media', location: 'SP', fitScoreEstimate: 80, suggestedContact: null, rationale: 'fit alto' },
];

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('SavedSearchesModal — Executar', () => {
    it('repassa os candidatos já encontrados pela API, sem exigir uma segunda busca', async () => {
        getMock.mockResolvedValueOnce([SAVED_SEARCH]);
        postMock.mockResolvedValueOnce({
            count: 1,
            savedSearch: { ...SAVED_SEARCH, leadsDiscovered: 4 },
            candidates: CANDIDATES,
            searchId: 'exec-1',
        });
        const onApplyCriteria = vi.fn();
        const user = userEvent.setup();

        render(
            <SavedSearchesModal
                isOpen
                onClose={vi.fn()}
                onApplyCriteria={onApplyCriteria}
            />,
        );

        await screen.findByText('Frotas SP');
        await user.click(screen.getByTitle('Executar busca agora'));

        await waitFor(() => expect(onApplyCriteria).toHaveBeenCalledTimes(1));
        expect(onApplyCriteria).toHaveBeenCalledWith(SAVED_SEARCH.criteria, CANDIDATES);
        expect(postMock).toHaveBeenCalledWith('/api/prospecting/saved-searches/search-1/run');
    });

    it('não quebra quando a API não devolve candidatos (compatibilidade)', async () => {
        getMock.mockResolvedValueOnce([SAVED_SEARCH]);
        postMock.mockResolvedValueOnce({
            count: 0,
            savedSearch: SAVED_SEARCH,
            candidates: undefined,
        });
        const onApplyCriteria = vi.fn();
        const user = userEvent.setup();

        render(
            <SavedSearchesModal
                isOpen
                onClose={vi.fn()}
                onApplyCriteria={onApplyCriteria}
            />,
        );

        await screen.findByText('Frotas SP');
        await user.click(screen.getByTitle('Executar busca agora'));

        await waitFor(() => expect(onApplyCriteria).toHaveBeenCalledWith(SAVED_SEARCH.criteria, []));
    });
});

// Achado da auditoria (PR #328): este modal era reimplementado à mão (overlay `fixed inset-0` +
// painel próprio) em vez de usar o primitivo compartilhado `ui/Dialog` — sem Escape para fechar e
// sem clique-fora-fecha (só o botão X/"Fechar" funcionavam). Migrado para `ui/Dialog`, que já
// resolve os dois de propósito (ver Dialog.tsx). Este teste prova que Escape agora funciona aqui.
describe('SavedSearchesModal — fechamento via Dialog compartilhado', () => {
    it('Escape fecha o modal (comportamento herdado de ui/Dialog, antes ausente aqui)', async () => {
        getMock.mockResolvedValueOnce([SAVED_SEARCH]);
        const onClose = vi.fn();

        const { container } = render(<SavedSearchesModal isOpen onClose={onClose} />);

        await screen.findByText('Frotas SP');
        const dialogEl = container.querySelector('dialog');
        expect(dialogEl).not.toBeNull();
        fireEvent.keyDown(dialogEl as Element, { key: 'Escape', code: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
