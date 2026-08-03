import { http, HttpResponse } from 'msw';
import { ok } from './http';

export const knowledgeHandlers = [
    http.get('/api/knowledge', () => ok([])),
    http.post('/api/knowledge', () => ok({ id: 'doc-x', title: '', chunkCount: 0, embeddingFailures: 0 })),
    http.post('/api/knowledge/search', () => ok({ query: '', semanticAvailable: true, hits: [] })),
    http.post('/api/knowledge/:id/reembed', () => ok({ repaired: 0, remaining: 0 })),
    http.delete('/api/knowledge/:id', () => new HttpResponse(null, { status: 204 })),
];
