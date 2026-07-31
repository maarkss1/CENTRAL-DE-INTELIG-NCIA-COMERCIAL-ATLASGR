/**
 * Divisão de texto para RAG.
 *
 * A estratégia é hierárquica: tentamos quebrar em parágrafos, depois em frases e só então no meio
 * de uma frase. Isso importa porque um trecho cortado no meio de uma ideia gera um embedding ruim —
 * o vetor acaba representando meia sentença e a busca semântica passa a errar.
 */

/** Tamanho alvo de cada trecho, em caracteres. */
export const DEFAULT_CHUNK_SIZE = 1_000;

/**
 * Sobreposição entre trechos vizinhos. Sem ela, uma resposta que fica exatamente na fronteira
 * entre dois trechos não é recuperada por nenhum dos dois.
 */
export const DEFAULT_CHUNK_OVERLAP = 150;

/** Trechos menores que isso são ruído (linhas soltas, títulos órfãos) e não viram embedding. */
const MIN_CHUNK_LENGTH = 25;

/** Normaliza quebras de linha e remove espaçamento excessivo, preservando parágrafos. */
export function normalizeText(raw: string): string {
    return raw
        .replace(/\r\n?/g, '\n')
        // 3+ quebras viram exatamente 2: mantém a separação de parágrafo sem inflar o texto.
        .replace(/\n{3,}/g, '\n\n')
        // Espaços/tabs repetidos no meio da linha.
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

/** Quebra um bloco grande em pedaços <= size, preferindo fronteiras de frase. */
function splitLongBlock(block: string, size: number, overlap: number): string[] {
    const out: string[] = [];
    let cursor = 0;

    while (cursor < block.length) {
        const end = Math.min(cursor + size, block.length);
        let slice = block.slice(cursor, end);

        // Se não chegamos ao fim do bloco, recua até o último fim de frase para não cortar no meio.
        if (end < block.length) {
            const lastBreak = Math.max(
                slice.lastIndexOf('. '),
                slice.lastIndexOf('! '),
                slice.lastIndexOf('? '),
                slice.lastIndexOf('\n'),
            );
            // Só aceita o recuo se ele não jogar fora mais da metade do trecho — caso contrário
            // (texto sem pontuação, como uma tabela) é melhor cortar no limite mesmo.
            if (lastBreak > size / 2) {
                slice = slice.slice(0, lastBreak + 1);
            }
        }

        const trimmed = slice.trim();
        if (trimmed.length > 0) out.push(trimmed);

        const consumed = slice.length;
        // `consumed - overlap` pode ser <= 0 em trechos degenerados; o Math.max evita loop infinito.
        cursor += Math.max(consumed - overlap, 1);
        if (cursor >= block.length) break;
    }

    return out;
}

/**
 * Divide o texto em trechos prontos para embedding.
 * Retorna array vazio se o texto não tiver conteúdo aproveitável.
 */
export function chunkText(
    raw: string,
    size: number = DEFAULT_CHUNK_SIZE,
    overlap: number = DEFAULT_CHUNK_OVERLAP,
): string[] {
    const text = normalizeText(raw);
    if (!text) return [];

    // Overlap maior ou igual ao tamanho faria o cursor nunca avançar.
    const safeOverlap = Math.min(Math.max(overlap, 0), Math.floor(size / 2));

    const paragraphs = text.split('\n\n').map((p) => p.trim()).filter(Boolean);
    const chunks: string[] = [];
    let buffer = '';

    const flush = () => {
        const trimmed = buffer.trim();
        if (trimmed) chunks.push(trimmed);
        buffer = '';
    };

    for (const paragraph of paragraphs) {
        if (paragraph.length > size) {
            // Parágrafo sozinho já estoura o limite: fecha o buffer e fatia o parágrafo.
            flush();
            chunks.push(...splitLongBlock(paragraph, size, safeOverlap));
            continue;
        }

        if (buffer && buffer.length + paragraph.length + 2 > size) {
            flush();
        }
        buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    }
    flush();

    // Descarta fragmentos curtos demais, mas nunca devolve vazio quando havia texto: se todos os
    // trechos forem curtos (um documento de uma linha só), mantemos o conteúdo original.
    const meaningful = chunks.filter((c) => c.length >= MIN_CHUNK_LENGTH);
    if (meaningful.length > 0) return meaningful;
    return chunks.length > 0 ? chunks : [text];
}
