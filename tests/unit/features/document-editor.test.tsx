import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';

/**
 * `Editor.tsx` (`/app/editor`) não tinha nenhum teste antes do Piloto 023 — cobre aqui o mesmo
 * essencial já coberto para a tela-irmã (`knowledge-base.test.tsx`): listar, editar/salvar, e o
 * achado de RBAC (VISUALIZADOR não podia editar, mas a tela nunca escondia os controles).
 */

// GESTOR por padrão: mantém os controles de escrita visíveis, sem exigir AuthProvider/authClient
// reais só para montar o componente. Mesmo padrão de `automations-ui.test.tsx`/
// `knowledge-base.test.tsx`/`calendar.test.tsx`/`notifications.test.tsx`.
const useAuthMock = vi.fn(() => ({ currentUser: { role: 'GESTOR' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => useAuthMock() }));

import { Editor } from '@/features/document-editor/components/Editor';
import { BrandProvider } from '@/contexts/BrandContext';

const LIST_URL = '/api/knowledge';

function render(ui: React.ReactElement) {
    return rtlRender(<BrandProvider>{ui}</BrandProvider>);
}

const resumo = {
    id: 'doc-1',
    title: 'Playbook de Objeções',
    sourceType: 'file',
    sourceName: 'playbook.docx',
    chunkCount: 12,
    version: 1,
    createdAt: '2026-07-30T12:00:00.000Z',
    updatedAt: '2026-07-30T12:00:00.000Z',
};

const completo = {
    ...resumo,
    content: 'Conteúdo original do documento.',
};

function mockList(items: unknown[]) {
    server.use(http.get(LIST_URL, () => HttpResponse.json({ success: true, data: items })));
}

function mockGet(doc: unknown) {
    server.use(http.get(`${LIST_URL}/:id`, () => HttpResponse.json({ success: true, data: doc })));
}

beforeEach(() => {
    mockList([]);
    useAuthMock.mockReturnValue({ currentUser: { role: 'GESTOR' } });
});

afterEach(() => {
    cleanup();
    server.resetHandlers();
});

describe('Editor de Documentos', () => {
    it('mostra estado vazio quando não há documentos', async () => {
        render(<Editor />);
        expect(await screen.findByText('Nenhum documento para editar')).toBeTruthy();
    });

    it('lista os documentos e carrega o conteúdo do primeiro automaticamente', async () => {
        mockList([resumo]);
        mockGet(completo);
        render(<Editor />);

        expect(await screen.findByDisplayValue('Playbook de Objeções')).toBeTruthy();
        expect(await screen.findByDisplayValue('Conteúdo original do documento.')).toBeTruthy();
        // sourceName/version/updatedAt já vinham na API mas nunca eram exibidos (achado do
        // Piloto 023).
        expect(screen.getByText(/playbook\.docx/)).toBeTruthy();
    });

    it('edita e salva — chama PUT com title/content e mostra o resultado da reindexação', async () => {
        mockList([resumo]);
        mockGet(completo);
        let putBody: unknown;
        server.use(
            http.put(`${LIST_URL}/:id`, async ({ request }) => {
                putBody = await request.json();
                return HttpResponse.json({
                    success: true,
                    data: { id: 'doc-1', title: 'Playbook Revisado', chunkCount: 14, embeddingFailures: 0 },
                });
            }),
        );
        const user = userEvent.setup();
        render(<Editor />);

        const titleInput = await screen.findByDisplayValue('Playbook de Objeções');
        await user.clear(titleInput);
        await user.type(titleInput, 'Playbook Revisado');
        await user.click(screen.getByRole('button', { name: /Salvar/ }));

        await waitFor(() =>
            expect(putBody).toEqual({ title: 'Playbook Revisado', content: 'Conteúdo original do documento.' }),
        );
        // Reflete o resultado do PUT (chunkCount atualizado de 12 para 14) sem depender de o
        // sistema de toast estar montado nesta árvore de teste.
        expect(await screen.findByText(/14 trecho\(s\) indexado\(s\)/)).toBeTruthy();
    });

    it('VISUALIZADOR não vê Salvar/Descartar e os campos ficam somente leitura (achado real do Piloto 023)', async () => {
        useAuthMock.mockReturnValue({ currentUser: { role: 'VISUALIZADOR' } });
        mockList([resumo]);
        mockGet(completo);
        render(<Editor />);

        await screen.findByDisplayValue('Playbook de Objeções');
        expect(screen.queryByRole('button', { name: /Salvar/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Descartar/ })).toBeNull();
        expect(screen.getByLabelText('Título do documento')).toHaveProperty('readOnly', true);
        expect(screen.getByLabelText('Conteúdo do documento')).toHaveProperty('readOnly', true);
    });

    it('mostra erro recuperável quando a listagem falha', async () => {
        server.use(
            http.get(LIST_URL, () => HttpResponse.json({ success: false, error: 'Banco indisponível' }, { status: 500 })),
        );
        render(<Editor />);
        expect(await screen.findByText('Banco indisponível')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy();
    });
});
