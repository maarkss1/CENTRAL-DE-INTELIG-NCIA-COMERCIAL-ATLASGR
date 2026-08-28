// @vitest-environment node
//
// Rota de backend (Express), sem DOM — `node` é o ambiente correto (o `jsdom` default deste
// projeto, ver vitest.unit.config.ts, existe para componentes React). O parser é mockado aqui, mas
// manter o mesmo ambiente do teste de fixtures reais evita qualquer divergência de comportamento
// entre os dois arquivos.
/**
 * Onda 42 (CPI, DEC-10 opção A): a Base de Conhecimento passa a suportar upload real de `.pdf`
 * (e mantém o suporte já existente a `.docx`). Este teste cobre `extractText()` — o ponto exato
 * onde `.pdf`/`.doc` eram recusados antes desta onda — com os parsers (`pdf-parse`, `mammoth`)
 * mockados, então roda sem nenhuma dependência de arquivo real ou rede.
 *
 * Ver `tests/unit/features/knowledge/knowledge.routes.extractText.fixtures.test.ts` para o mesmo
 * `extractText()` rodando contra um PDF/DOCX real de fixture, sem mock do parser.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const pdfParseMock = vi.fn();
vi.mock('pdf-parse', () => ({
    default: (...args: unknown[]) => pdfParseMock(...args),
}));

const mammothExtractRawTextMock = vi.fn();
vi.mock('mammoth', () => ({
    default: {
        extractRawText: (...args: unknown[]) => mammothExtractRawTextMock(...args),
    },
}));

// knowledge.routes.ts também importa ingestionService/searchService/getAiModel — nenhum deles é
// exercitado por extractText(), mas o módulo inteiro precisa carregar sem erro. Mockados aqui para
// não puxar prisma/redis/langfuse reais (mesmo padrão de
// tests/unit/features/intelligence/routes/ai-suite.knowledge-copilot.routes.test.ts).
vi.mock('../../../../src/features/knowledge/ingestion.service.js', () => ({
    ingestionService: {
        ingestText: vi.fn(),
        updateDocument: vi.fn(),
        list: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        reembedDocument: vi.fn(),
    },
}));

vi.mock('../../../../src/features/knowledge/search.service.js', () => ({
    searchService: { hybridSearch: vi.fn() },
}));

vi.mock('../../../../src/lib/ai/gateway.js', () => ({
    getAiModel: vi.fn(),
}));

const loggerErrorMock = vi.fn();
const loggerWarnMock = vi.fn();
vi.mock('../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: (...args: unknown[]) => loggerWarnMock(...args), error: (...args: unknown[]) => loggerErrorMock(...args) },
}));

const { extractText } = await import('../../../../src/features/knowledge/knowledge.routes.js');

function toBase64(text: string): string {
    return Buffer.from(text, 'utf-8').toString('base64');
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('extractText — PDF (onda 42, suporte novo)', () => {
    it('extrai o texto de um PDF válido, passando MAX_PDF_PAGES como teto de páginas', async () => {
        pdfParseMock.mockResolvedValue({ text: 'Conteúdo real do PDF.', numpages: 3 });

        const result = await extractText('proposta.pdf', toBase64('bytes-de-um-pdf-fake'));

        expect(result).toBe('Conteúdo real do PDF.');
        expect(pdfParseMock).toHaveBeenCalledTimes(1);
        const [, options] = pdfParseMock.mock.calls[0] as [unknown, { max: number }];
        expect(options.max).toBe(500);
    });

    it('rejeita com mensagem clara quando o PDF está protegido por senha', async () => {
        const err = Object.assign(new Error('No password given'), { name: 'PasswordException' });
        pdfParseMock.mockRejectedValue(err);

        await expect(extractText('confidencial.pdf', toBase64('x'))).rejects.toThrow(/senha/i);
    });

    it('rejeita com mensagem clara quando o PDF está corrompido/inválido', async () => {
        const err = Object.assign(new Error('bad xref'), { name: 'InvalidPDFException' });
        pdfParseMock.mockRejectedValue(err);

        await expect(extractText('quebrado.pdf', toBase64('x'))).rejects.toThrow(/corrompido|inválido/i);
    });

    it('rejeita com mensagem genérica (e loga) para um erro de parsing não classificado', async () => {
        pdfParseMock.mockRejectedValue(new Error('unexpected pdf.js failure'));

        await expect(extractText('estranho.pdf', toBase64('x'))).rejects.toThrow(/não foi possível ler/i);
        expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    });

    it('NUNCA finge sucesso com texto vazio — trata PDF escaneado sem OCR como falha explícita', async () => {
        pdfParseMock.mockResolvedValue({ text: '   \n  ', numpages: 4 });

        await expect(extractText('escaneado.pdf', toBase64('x'))).rejects.toThrow(/escaneado|OCR/i);
    });
});

describe('extractText — DOCX (já suportado antes desta onda, comportamento preservado)', () => {
    it('extrai o texto de um DOCX válido via mammoth', async () => {
        mammothExtractRawTextMock.mockResolvedValue({ value: 'Conteúdo real do DOCX.' });

        const result = await extractText('proposta.docx', toBase64('bytes-de-um-docx-fake'));

        expect(result).toBe('Conteúdo real do DOCX.');
        expect(mammothExtractRawTextMock).toHaveBeenCalledTimes(1);
    });

    it('rejeita com mensagem clara (e loga) quando o DOCX está corrompido', async () => {
        mammothExtractRawTextMock.mockRejectedValue(new Error('end of central directory record signature not found'));

        await expect(extractText('quebrado.docx', toBase64('x'))).rejects.toThrow(/não foi possível ler.*docx|corrompido/i);
        expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    });
});

describe('extractText — formatos de texto simples e HTML (comportamento preexistente, não deve regredir)', () => {
    it('decodifica .txt como UTF-8 direto', async () => {
        const result = await extractText('nota.txt', toBase64('texto simples'));
        expect(result).toBe('texto simples');
    });

    it('remove tags de .html mantendo o texto visível', async () => {
        const result = await extractText('pagina.html', toBase64('<p>Olá <b>mundo</b></p>'));
        expect(result).toBe('Olá mundo');
    });
});

describe('extractText — formatos fora de escopo', () => {
    it('rejeita .doc (binário legado) com mensagem listando os formatos aceitos, incluindo .pdf', async () => {
        await expect(extractText('antigo.doc', toBase64('x'))).rejects.toThrow(/\.pdf/);
    });

    it('rejeita extensão desconhecida', async () => {
        await expect(extractText('arquivo.xyz', toBase64('x'))).rejects.toThrow(/não suportado/i);
    });

    it('rejeita arquivo vazio/corrompido antes mesmo de olhar a extensão', async () => {
        await expect(extractText('vazio.pdf', '')).rejects.toThrow(/vazio ou corrompido/i);
    });
});
