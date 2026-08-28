// @vitest-environment node
//
// `pdf-parse` (via pdf.js) detecta ambiente de execução olhando `typeof window` — sob o `jsdom`
// (ambiente default deste projeto, ver vitest.unit.config.ts) ele se comporta como se estivesse no
// browser e exige um `PDFJS.workerSrc` que este projeto não tem (server-side, sem worker de
// verdade). `node` é o ambiente correto para uma rota de backend de qualquer forma — nenhum destes
// testes toca DOM.
/**
 * Onda 42 (CPI, DEC-10 opção A): mesma `extractText()` de
 * `knowledge.routes.extractText.test.ts`, mas aqui SEM mockar `pdf-parse`/`mammoth` — roda contra
 * um PDF e um DOCX reais, pequenos, versionados em `tests/fixtures/knowledge/`. Prova que o
 * pipeline funciona de ponta a ponta com os parsers de verdade, não só com o parser simulado.
 *
 * Os fixtures foram gerados fora deste teste (não no CI) e commitados como binário:
 * - `sample.pdf`: PDF de uma página, texto real (não escaneado), gerado à mão e validado contra
 *   pdf-parse antes de ser commitado.
 * - `sample.docx`: DOCX mínimo válido (Content_Types/rels/document.xml), gerado com jszip e
 *   validado contra mammoth antes de ser commitado.
 *
 * Ambos os fixtures existem só para este teste — não reutilize para outra suíte sem revisar se o
 * conteúdo textual esperado ainda bate.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Mesmos mocks "neutros" de knowledge.routes.extractText.test.ts para as dependências que
// extractText() não exercita (ingestionService/searchService/getAiModel/logger) — só aqui para o
// módulo carregar; nenhum deles é chamado neste teste.
import { vi } from 'vitest';
vi.mock('../../../../src/features/knowledge/ingestion.service.js', () => ({
    ingestionService: {
        ingestText: vi.fn(), updateDocument: vi.fn(), list: vi.fn(), get: vi.fn(), delete: vi.fn(), reembedDocument: vi.fn(),
    },
}));
vi.mock('../../../../src/features/knowledge/search.service.js', () => ({
    searchService: { hybridSearch: vi.fn() },
}));
vi.mock('../../../../src/lib/ai/gateway.js', () => ({ getAiModel: vi.fn() }));
vi.mock('../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { extractText } = await import('../../../../src/features/knowledge/knowledge.routes.js');

const FIXTURES_DIR = path.resolve(__dirname, '../../../fixtures/knowledge');

function fixtureBase64(fileName: string): string {
    return readFileSync(path.join(FIXTURES_DIR, fileName)).toString('base64');
}

describe('extractText — fixtures reais (sem mock de parser)', () => {
    it('extrai texto real de tests/fixtures/knowledge/sample.pdf via pdf-parse de verdade', async () => {
        const result = await extractText('sample.pdf', fixtureBase64('sample.pdf'));
        expect(result).toContain('Hello AtlasGR fixture PDF test');
    });

    it('extrai texto real de tests/fixtures/knowledge/sample.docx via mammoth de verdade', async () => {
        const result = await extractText('sample.docx', fixtureBase64('sample.docx'));
        expect(result).toContain('Fixture de teste - Base de Conhecimento ATLASGR.');
        expect(result).toContain('CPI DEC-10 opcao A');
    });
});
