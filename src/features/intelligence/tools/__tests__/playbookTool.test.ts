import { describe, expect, it, vi, beforeEach } from 'vitest';

// Proveniência ponta a ponta do RAG (Onda 7): toda resposta desta ferramenta precisa citar o
// documento de origem de cada trecho, nunca apresentar o texto como se fosse conhecimento do
// próprio modelo, e nunca afirmar ter encontrado algo que não existe.

const similaritySearchMock = vi.fn();
vi.mock('../../../../lib/ai/vectorStore.js', () => ({
    vectorStore: { similaritySearch: (...args: unknown[]) => similaritySearchMock(...args) },
}));

import { searchPlaybookTool } from '../playbookTool';

beforeEach(() => {
    similaritySearchMock.mockReset();
});

describe('searchPlaybookTool', () => {
    it('nunca afirma ter encontrado uma fonte quando não há resultado nenhum', async () => {
        similaritySearchMock.mockResolvedValue([]);

        const result = await searchPlaybookTool.invoke({ query: 'ICP inexistente' });

        expect(result).toContain('Nenhum trecho do playbook encontrado');
        expect(result).not.toContain('Fonte:');
    });

    it('cita o documento de origem (título + posição do trecho) em cada resultado semântico', async () => {
        similaritySearchMock.mockResolvedValue([
            {
                id: 'chunk-1',
                content: 'Transportadoras em expansão operacional são PIC1.',
                documentId: 'doc-1',
                documentTitle: 'Playbook Comercial AtlasGR',
                chunkIndex: 4,
                similarity: 0.86,
                matchedBy: ['semantic'],
            },
        ]);

        const result = await searchPlaybookTool.invoke({ query: 'como qualificar PIC1?' });

        expect(result).toContain('Fonte: "Playbook Comercial AtlasGR"');
        expect(result).toContain('trecho 5');
        expect(result).toContain('86.0%');
        expect(result).toContain('Transportadoras em expansão operacional são PIC1.');
    });

    it('descarta resultado semântico abaixo do limiar de confiança em vez de citar uma fonte fraca', async () => {
        similaritySearchMock.mockResolvedValue([
            {
                id: 'chunk-2',
                content: 'trecho pouco relacionado',
                documentId: 'doc-2',
                documentTitle: 'Matriz de Objeções',
                chunkIndex: 0,
                similarity: 0.4,
                matchedBy: ['semantic'],
            },
        ]);

        const result = await searchPlaybookTool.invoke({ query: 'termo vago' });

        expect(result).toContain('relevância era muito baixa');
        expect(result).not.toContain('Matriz de Objeções');
    });

    it('cita um resultado só de palavra-chave (sem score semântico) sem aplicar o limiar semântico', async () => {
        similaritySearchMock.mockResolvedValue([
            {
                id: 'chunk-3',
                content: 'CNPJ e código de produto batem por palavra-chave',
                documentId: 'doc-3',
                documentTitle: 'Tabela de Códigos',
                chunkIndex: 1,
                similarity: null,
                matchedBy: ['keyword'],
            },
        ]);

        const result = await searchPlaybookTool.invoke({ query: 'código PRD-99' });

        expect(result).toContain('Fonte: "Tabela de Códigos"');
        expect(result).toContain('correspondência por palavra-chave');
    });

    it('devolve mensagem de erro (não lança) quando a busca falha', async () => {
        similaritySearchMock.mockRejectedValue(new Error('embedding provider fora do ar'));

        const result = await searchPlaybookTool.invoke({ query: 'qualquer coisa' });

        expect(result).toContain('Erro ao buscar no playbook');
        expect(result).toContain('embedding provider fora do ar');
    });
});
