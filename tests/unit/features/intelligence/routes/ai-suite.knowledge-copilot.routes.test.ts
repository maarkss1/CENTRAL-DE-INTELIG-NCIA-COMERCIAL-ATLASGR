import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * AI-010 (onda 34): até esta correção, `POST /api/intelligence/suite/knowledge/copilot` confiava
 * em `retrievedDocumentSnippets` enviado pelo CLIENTE — qualquer texto virava "documento" e o LLM
 * inventava livremente os `sourceReferences` a partir dele. Este teste trava a regressão: a rota
 * agora chama `searchService.hybridSearch` de verdade, com a organização do usuário autenticado
 * (nunca de querystring/body), e nunca mais aceita snippets do cliente.
 */

const hybridSearchMock = vi.fn();

vi.mock('../../../../../src/features/knowledge/search.service.js', () => ({
    searchService: { hybridSearch: (...args: unknown[]) => hybridSearchMock(...args) },
}));

const answerTechnicalQuestionMock = vi.fn();

vi.mock('../../../../../src/features/knowledge/services/knowledge-copilot.service.js', () => ({
    KnowledgeCopilotService: vi.fn().mockImplementation(function FakeKnowledgeCopilotService() {
        return { answerTechnicalQuestion: (...args: unknown[]) => answerTechnicalQuestionMock(...args) };
    }),
}));

import { aiSuiteRouter } from '@/features/intelligence/routes/ai-suite.routes';
import { errorHandler } from '@/shared/middlewares/errorHandler';

function buildApp(organizationId = 'org-1') {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as { user: { id: string; organizationId: string; role: string } }).user = {
            id: 'test-user',
            organizationId,
            role: 'GESTOR',
        };
        next();
    });
    app.use('/api/intelligence/suite', aiSuiteRouter);
    app.use(errorHandler);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/intelligence/suite/knowledge/copilot (AI-010/onda-34)', () => {
    it('busca a base de conhecimento REAL com a organização do usuário autenticado, nunca do body', async () => {
        hybridSearchMock.mockResolvedValue({ hits: [{ chunkId: 'c1', documentId: 'd1', documentTitle: 'Manual', content: 'x', chunkIndex: 0, matchedBy: ['semantic'], similarity: 0.9, score: 0.5 }], semanticAvailable: true, query: 'voltagem' });
        answerTechnicalQuestionMock.mockResolvedValue({ directAnswer: 'ok', technicalSpecifications: [], confidenceScore: 90, sourceReferences: [] });

        const res = await request(buildApp('org-real'))
            .post('/api/intelligence/suite/knowledge/copilot')
            .send({ question: 'Qual a voltagem do módulo?', organizationId: 'org-outra-tentativa' });

        expect(res.status).toBe(200);
        expect(hybridSearchMock).toHaveBeenCalledWith('org-real', 'Qual a voltagem do módulo?');
        expect(answerTechnicalQuestionMock).toHaveBeenCalledWith(expect.objectContaining({
            question: 'Qual a voltagem do módulo?',
            hits: [expect.objectContaining({ documentId: 'd1' })],
        }));
    });

    it('ignora silenciosamente qualquer retrievedDocumentSnippets enviado pelo cliente (contrato antigo)', async () => {
        hybridSearchMock.mockResolvedValue({ hits: [], semanticAvailable: true, query: 'x' });
        answerTechnicalQuestionMock.mockResolvedValue({ directAnswer: 'ok', technicalSpecifications: [], confidenceScore: 50, sourceReferences: [] });

        const res = await request(buildApp('org-1'))
            .post('/api/intelligence/suite/knowledge/copilot')
            .send({ question: 'Pergunta válida', retrievedDocumentSnippets: ['texto que o cliente inventou como se fosse um manual real'] });

        expect(res.status).toBe(200);
        expect(answerTechnicalQuestionMock).toHaveBeenCalledWith(expect.objectContaining({ hits: [] }));
        const passedInput = answerTechnicalQuestionMock.mock.calls[0]![0] as Record<string, unknown>;
        expect(passedInput).not.toHaveProperty('retrievedDocumentSnippets');
    });

    it('rejeita pergunta vazia/curta demais com 400, sem chamar busca nem LLM', async () => {
        const res = await request(buildApp('org-1'))
            .post('/api/intelligence/suite/knowledge/copilot')
            .send({ question: 'a' });

        expect(res.status).toBe(400);
        expect(hybridSearchMock).not.toHaveBeenCalled();
        expect(answerTechnicalQuestionMock).not.toHaveBeenCalled();
    });
});
