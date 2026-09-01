import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';

// GESTOR por padrão: mantém os controles de escrita (enviar arquivo/colar texto/editar/reembed/
// gerar FAQ/excluir) visíveis pra exercitar os fluxos já cobertos por este arquivo, sem exigir
// AuthProvider/authClient reais só para montar o componente. Mesmo padrão de
// `tests/unit/features/automations-ui.test.tsx` — achado do Piloto 019 (`Base.tsx` passou a
// esconder ações de escrita por papel, ver `hasRequiredRole`).
const useAuthMock = vi.fn(() => ({ currentUser: { role: 'GESTOR' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => useAuthMock() }));

// O componente busca a lista de documentos no mount e a busca via POST. Mockamos via MSW na
// camada HTTP (não a camada de API) para testar o comportamento da tela sem depender de servidor
// nem de banco.
import { Base } from '@/features/knowledge/components/Base';
import { BrandProvider } from '@/contexts/BrandContext';

const KNOWLEDGE_URL = '/api/knowledge';

/** A tela usa `useBrandAccent`, que exige o BrandProvider acima na árvore. */
function render(ui: React.ReactElement) {
    return rtlRender(<BrandProvider>{ui}</BrandProvider>);
}

const documento = {
    id: 'doc-1',
    title: 'Playbook de Objeções',
    sourceType: 'file',
    sourceName: 'playbook.docx',
    chunkCount: 12,
    createdAt: '2026-07-30T12:00:00.000Z',
    updatedAt: '2026-07-30T12:00:00.000Z',
};

let listCallCount: number;

function mockList(items: unknown[]) {
    server.use(
        http.get(KNOWLEDGE_URL, () => {
            listCallCount += 1;
            return HttpResponse.json({ success: true, data: items });
        }),
    );
}

beforeEach(() => {
    listCallCount = 0;
    mockList([]);
    // `afterEach` chama `vi.restoreAllMocks()`, que zera a implementação de `useAuthMock` (não é
    // um spy com original a restaurar) — precisa ser re-armado aqui a cada teste.
    useAuthMock.mockReturnValue({ currentUser: { role: 'GESTOR' } });
});

afterEach(() => {
    // O projeto não roda vitest com `globals: true`, então o auto-cleanup do Testing Library não
    // é registrado — sem isto o DOM do teste anterior sobra e as queries acham elementos duplicados.
    cleanup();
    vi.restoreAllMocks();
    server.resetHandlers();
});

describe('Base de Conhecimento', () => {
    it('mostra o estado vazio quando não há documentos', async () => {
        render(<Base />);
        expect(await screen.findByText('Nenhum documento ainda')).toBeTruthy();
    });

    it('lista os documentos com contagem de trechos', async () => {
        mockList([documento]);
        render(<Base />);

        expect(await screen.findByText('Playbook de Objeções')).toBeTruthy();
        // A linha do documento traz a contagem, a data e o arquivo de origem.
        expect(screen.getByText(/12 trechos · .* · playbook\.docx/)).toBeTruthy();
        // O resumo no cabeçalho soma os trechos de todos os documentos.
        expect(screen.getByText(/1 documento · 12 trechos indexados/)).toBeTruthy();
    });

    it('exibe erro recuperável quando a listagem falha', async () => {
        server.use(
            http.get(KNOWLEDGE_URL, () => HttpResponse.json({ success: false, error: 'Banco indisponível' }, { status: 500 })),
        );
        render(<Base />);

        expect(await screen.findByText('Banco indisponível')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy();
    });

    it('busca e renderiza os trechos encontrados com a origem do match', async () => {
        mockList([documento]);
        let searchCalledWith: unknown;
        server.use(
            http.post(`${KNOWLEDGE_URL}/search`, async ({ request }) => {
                searchCalledWith = await request.json();
                return HttpResponse.json({
                    success: true,
                    data: {
                        query: 'sinistro',
                        semanticAvailable: true,
                        hits: [{
                            chunkId: 'c-1',
                            documentId: 'doc-1',
                            documentTitle: 'Playbook de Objeções',
                            content: 'Para reduzir sinistro, priorize escolta em rotas críticas.',
                            chunkIndex: 3,
                            matchedBy: ['semantic', 'keyword'],
                            similarity: 0.87,
                            score: 0.03,
                        }],
                    },
                });
            }),
        );

        const user = userEvent.setup();
        render(<Base />);
        await screen.findByText('Playbook de Objeções');

        await user.type(screen.getByPlaceholderText(/Pergunte em linguagem natural/), 'sinistro');
        await user.click(screen.getByRole('button', { name: 'Buscar' }));

        await waitFor(() => expect(searchCalledWith).toEqual({ query: 'sinistro', limit: undefined }));
        expect(await screen.findByText('1 trecho relevante')).toBeTruthy();
        expect(screen.getByText('semântico')).toBeTruthy();
        expect(screen.getByText('termo')).toBeTruthy();
        // Similaridade exibida como porcentagem inteira.
        expect(screen.getByText('87%')).toBeTruthy();
        // Numeração do trecho é 1-based na UI, mesmo o índice sendo 0-based no banco.
        expect(screen.getByText('trecho #4')).toBeTruthy();
    });

    it('avisa quando a busca semântica está fora do ar', async () => {
        server.use(
            http.post(`${KNOWLEDGE_URL}/search`, () => HttpResponse.json({
                success: true,
                data: { query: 'rota', semanticAvailable: false, hits: [] },
            })),
        );

        const user = userEvent.setup();
        render(<Base />);
        await screen.findByText('Nenhum documento ainda');

        await user.type(screen.getByPlaceholderText(/Pergunte em linguagem natural/), 'rota');
        await user.click(screen.getByRole('button', { name: 'Buscar' }));

        expect(await screen.findByText(/Busca semântica fora do ar/)).toBeTruthy();
    });

    it('não chama a API com busca curta demais', async () => {
        let searchCalled = false;
        server.use(
            http.post(`${KNOWLEDGE_URL}/search`, () => {
                searchCalled = true;
                return HttpResponse.json({ success: true, data: { query: '', semanticAvailable: true, hits: [] } });
            }),
        );

        const user = userEvent.setup();
        render(<Base />);
        await screen.findByText('Nenhum documento ainda');

        await user.type(screen.getByPlaceholderText(/Pergunte em linguagem natural/), 'a');
        await user.click(screen.getByRole('button', { name: 'Buscar' }));

        expect(searchCalled).toBe(false);
    });

    it('indexa texto colado e recarrega a lista', async () => {
        let ingestCalledWith: unknown;
        server.use(
            http.post(KNOWLEDGE_URL, async ({ request }) => {
                ingestCalledWith = await request.json();
                return HttpResponse.json({
                    success: true,
                    data: { id: 'doc-2', title: 'Tabela de Preços', chunkCount: 4, embeddingFailures: 0 },
                });
            }),
        );

        const user = userEvent.setup();
        render(<Base />);
        await screen.findByText('Nenhum documento ainda');

        await user.click(screen.getAllByRole('button', { name: /Colar texto/ })[0]);
        fireEvent.change(screen.getByPlaceholderText(/Título/), { target: { value: 'Tabela de Preços' } });
        fireEvent.change(screen.getByPlaceholderText(/Cole aqui o conteúdo/), { target: { value: 'Frota até 50 veículos: R$ 90/mês.' } });
        await user.click(screen.getByRole('button', { name: 'Indexar' }));

        await waitFor(() => expect(ingestCalledWith).toEqual({
            title: 'Tabela de Preços',
            content: 'Frota até 50 veículos: R$ 90/mês.',
        }));
        // Recarrega para refletir o documento novo: 1 chamada no mount + 1 após indexar.
        await waitFor(() => expect(listCallCount).toBe(2));
    });

    it('remove documento apenas após confirmação', async () => {
        // Onda de migração de window.confirm() para o diálogo estilizado (useConfirmDialog):
        // interage com o diálogo real renderizado pelo componente em vez de mockar window.confirm.
        mockList([documento]);
        let removeCalledWith: string | undefined;
        server.use(
            http.delete(`${KNOWLEDGE_URL}/:id`, ({ params }) => {
                removeCalledWith = String(params.id);
                return new HttpResponse(null, { status: 204 });
            }),
        );

        const user = userEvent.setup();
        render(<Base />);
        await screen.findByText('Playbook de Objeções');

        await user.click(screen.getByTitle('Remover documento'));
        expect(await screen.findByRole('dialog')).toBeTruthy();
        expect(screen.getByText('Remover documento')).toBeTruthy();
        expect(
            screen.getByText('Remover "Playbook de Objeções" da base? Esta ação não pode ser desfeita.'),
        ).toBeTruthy();

        await user.click(screen.getByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(removeCalledWith).toBeUndefined();

        await user.click(screen.getByTitle('Remover documento'));
        await user.click(screen.getByRole('button', { name: 'Remover' }));
        await waitFor(() => expect(removeCalledWith).toBe('doc-1'));
    });

    it('VISUALIZADOR não vê nenhum controle de escrita (achado do Piloto 019)', async () => {
        // POST/PUT/reembed/generate-faq exigem ADMIN/GESTOR/CLOSER/SDR no backend; DELETE exige
        // ADMIN/GESTOR — VISUALIZADOR não está em nenhum dos dois conjuntos.
        useAuthMock.mockReturnValue({ currentUser: { role: 'VISUALIZADOR' } });
        mockList([documento]);
        render(<Base />);

        await screen.findByText('Playbook de Objeções');
        expect(screen.queryByRole('button', { name: /Colar texto/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Enviar arquivo/ })).toBeNull();
        expect(screen.queryByTitle('Gerar FAQ Automático com IA')).toBeNull();
        expect(screen.queryByTitle('Editar documento')).toBeNull();
        expect(screen.queryByTitle('Regerar embeddings que falharam')).toBeNull();
        expect(screen.queryByTitle('Remover documento')).toBeNull();
        // Assistente de Redação IA (EditorIA) também some por completo.
        expect(screen.queryByText('Assistente de Redação IA')).toBeNull();
    });
});
