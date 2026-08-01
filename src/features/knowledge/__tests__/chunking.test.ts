import { describe, it, expect } from 'vitest';
import { chunkText, normalizeText, DEFAULT_CHUNK_SIZE } from '../chunking';

describe('normalizeText', () => {
    it('normaliza CRLF e colapsa quebras excessivas em separação de parágrafo', () => {
        expect(normalizeText('a\r\n\r\n\r\n\r\nb')).toBe('a\n\nb');
    });

    it('colapsa espaços repetidos sem juntar palavras', () => {
        expect(normalizeText('valor     total')).toBe('valor total');
    });

    it('devolve string vazia para entrada só de espaços', () => {
        expect(normalizeText('   \n\n  \t ')).toBe('');
    });
});

describe('chunkText', () => {
    it('devolve array vazio quando não há conteúdo', () => {
        expect(chunkText('')).toEqual([]);
        expect(chunkText('    \n\n   ')).toEqual([]);
    });

    it('mantém um texto curto como um único trecho', () => {
        const texto = 'A Atlas faz gerenciamento de risco para transportadoras de carga.';
        expect(chunkText(texto)).toEqual([texto]);
    });

    it('agrupa parágrafos pequenos em vez de gerar um trecho por parágrafo', () => {
        const paragrafo = 'Este parágrafo tem um tamanho razoável para o teste de agrupamento.';
        const chunks = chunkText([paragrafo, paragrafo, paragrafo].join('\n\n'));
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toContain(paragrafo);
    });

    it('respeita o tamanho máximo ao fatiar um parágrafo longo', () => {
        // Frases completas, para o corte cair em fronteira de sentença.
        const frase = 'O roubo de carga concentra-se em rodovias federais do Sudeste. ';
        const chunks = chunkText(frase.repeat(200));

        expect(chunks.length).toBeGreaterThan(1);
        for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(DEFAULT_CHUNK_SIZE);
        }
    });

    it('sobrepõe trechos vizinhos para não perder conteúdo na fronteira', () => {
        const frase = 'Cada frase precisa ser recuperável mesmo na divisa entre dois trechos. ';
        const chunks = chunkText(frase.repeat(100), 300, 100);

        expect(chunks.length).toBeGreaterThan(1);
        // Com sobreposição, a soma dos trechos é maior que o texto original.
        const somaTrechos = chunks.reduce((total, c) => total + c.length, 0);
        expect(somaTrechos).toBeGreaterThan(frase.repeat(100).trim().length);
    });

    it('não entra em laço infinito quando a sobreposição é maior que o tamanho', () => {
        // safeOverlap deve limitar a sobreposição a metade do tamanho.
        const chunks = chunkText('palavra '.repeat(500), 100, 999);
        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks.length).toBeLessThan(500);
    });

    it('fatia texto sem pontuação alguma (ex: tabela colada)', () => {
        const chunks = chunkText('X'.repeat(5_000));
        expect(chunks.length).toBeGreaterThan(1);
        for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(DEFAULT_CHUNK_SIZE);
        }
    });

    it('preserva conteúdo curto mesmo abaixo do tamanho mínimo de trecho', () => {
        // Um documento de uma linha só não pode virar array vazio.
        expect(chunkText('Preço: R$ 90')).toEqual(['Preço: R$ 90']);
    });

    it('descarta linhas de ruído quando existe conteúdo real', () => {
        const real = 'Este é o conteúdo relevante do documento, com tamanho suficiente para valer.';
        const chunks = chunkText(`ok\n\n${real}\n\nx`);
        expect(chunks.some((c) => c.includes(real))).toBe(true);
    });
});
