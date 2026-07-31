import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// O componente busca a lista de documentos no mount e a busca via POST. Mockamos a camada de API
// (e não o fetch) para testar o comportamento da tela sem depender de servidor nem de banco.
const listMock = vi.fn();
const searchMock = vi.fn();
const ingestTextMock = vi.fn();
const removeMock = vi.fn();
const reembedMock = vi.fn();

vi.mock('@/features/knowledge/knowledge.api', async () => {
    const actual = await vi.importActual<typeof import('@/features/knowledge/knowledge.api')>(
        '@/features/knowledge/knowledge.api',
    );
    return {
        ...actual,
        knowledgeApi: {
            list: () => listMock(),
            search: (q: string, l?: number) => searchMock(q, l),
            ingestText: (t: string, c: string) => ingestTextMock(t, c),
            upload: vi.fn(),
            remove: (id: string) => removeMock(id),
            reembed: (id: string) => reembedMock(id),
        },
    };
});

import { Base } from '@/features/knowledge/components/Base';
import { BrandProvider } from '@/contexts/BrandContext';

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

beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue([]);
});

afterEach(() => {
    // O projeto não roda vitest com `globals: true`, então o auto-cleanup do Testing Library não
    // é registrado — sem isto o DOM do teste anterior sobra e as queries acham elementos duplicados.
    cleanup();
    vi.restoreAllMocks();
});

describe('Base de Conhecimento', () => {
    it('mostra o estado vazio quando não há documentos', async () => {
        render(<Base />);
        expect(await screen.findByText('Nenhum documento ainda')).toBeTruthy();
    });

    it('lista os documentos com contagem de trechos', async () => {
        listMock.mockResolvedValue([documento]);
        render(<Base />);

        expect(await screen.findByText('Playbook de Objeções')).toBeTruthy();
        // A linha do documento traz a contagem, a data e o arquivo de origem.
        expect(screen.getByText(/12 trechos · .* · playbook\.docx/)).toBeTruthy();
        // O resumo no cabeçalho soma os trechos de todos os documentos.
        expect(screen.getByText(/1 documento · 12 trechos indexados/)).toBeTruthy();
    });

    it('exibe erro recuperável quando a listagem falha', async () => {
        listMock.mockRejectedValue(new Error('Banco indisponível'));
        render(<Base />);

        expect(await screen.findByText('Banco indisponível')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy();
    });

    it('busca e renderiza os trechos encontrados com a origem do match', async () => {
        listMock.mockResolvedValue([documento]);
        searchMock.mockResolvedValue({
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
        });

        const user = userEvent.setup();
        render(<Base />);
        await screen.findByText('Playbook de Objeções');

        await user.type(screen.getByPlaceholderText(/Pergunte em linguagem natural/), 'sinistro');
        await user.click(screen.getByRole('button', { name: 'Buscar' }));

        await waitFor(() => expect(searchMock).toHaveBeenCalledWith('sinistro', undefined));
        expect(await screen.findByText('1 trecho relevante')).toBeTruthy();
        expect(screen.getByText('semântico')).toBeTruthy();
        expect(screen.getByText('termo')).toBeTruthy();
        // Similaridade exibida como porcentagem inteira.
        expect(screen.getByText('87%')).toBeTruthy();
        // Numeração do trecho é 1-based na UI, mesmo o índice sendo 0-based no banco.
        expect(screen.getByText('trecho #4')).toBeTruthy();
    });

    it('avisa quando a busca semântica está fora do ar', async () => {
        searchMock.mockResolvedValue({ query: 'rota', semanticAvailable: false, hits: [] });

        const user = userEvent.setup();
        render(<Base />);
        await screen.findByText('Nenhum documento ainda');

        await user.type(screen.getByPlaceholderText(/Pergunte em linguagem natural/), 'rota');
        await user.click(screen.getByRole('button', { name: 'Buscar' }));

        expect(await screen.findByText(/Busca semântica fora do ar/)).toBeTruthy();
    });

    it('não chama a API com busca curta demais', async () => {
        const user = userEvent.setup();
        render(<Base />);
        await screen.findByText('Nenhum documento ainda');

        await user.type(screen.getByPlaceholderText(/Pergunte em linguagem natural/), 'a');
        await user.click(screen.getByRole('button', { name: 'Buscar' }));

        expect(searchMock).not.toHaveBeenCalled();
    });

    it('indexa texto colado e recarrega a lista', async () => {
        ingestTextMock.mockResolvedValue({
            id: 'doc-2', title: 'Tabela de Preços', chunkCount: 4, embeddingFailures: 0,
        });

        const user = userEvent.setup();
        render(<Base />);
        await screen.findByText('Nenhum documento ainda');

        await user.click(screen.getAllByRole('button', { name: /Colar texto/ })[0]);
        await user.type(screen.getByPlaceholderText(/Título/), 'Tabela de Preços');
        await user.type(screen.getByPlaceholderText(/Cole aqui o conteúdo/), 'Frota até 50 veículos: R$ 90/mês.');
        await user.click(screen.getByRole('button', { name: 'Indexar' }));

        await waitFor(() => expect(ingestTextMock).toHaveBeenCalledWith(
            'Tabela de Preços',
            'Frota até 50 veículos: R$ 90/mês.',
        ));
        // Recarrega para refletir o documento novo: 1 chamada no mount + 1 após indexar.
        await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
    });

    it('remove documento apenas após confirmação', async () => {
        listMock.mockResolvedValue([documento]);
        removeMock.mockResolvedValue(undefined);
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

        const user = userEvent.setup();
        render(<Base />);
        await screen.findByText('Playbook de Objeções');

        await user.click(screen.getByTitle('Remover documento'));
        expect(confirmSpy).toHaveBeenCalled();
        expect(removeMock).not.toHaveBeenCalled();

        confirmSpy.mockReturnValue(true);
        await user.click(screen.getByTitle('Remover documento'));
        await waitFor(() => expect(removeMock).toHaveBeenCalledWith('doc-1'));
    });
});
