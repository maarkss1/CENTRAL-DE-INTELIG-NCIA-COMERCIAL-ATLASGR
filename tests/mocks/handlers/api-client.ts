import { http, HttpResponse } from 'msw';

/**
 * Endpoint genérico usado só por `tests/unit/lib/api.test.ts` para exercitar o cliente HTTP
 * (`src/lib/api.ts`) em si — sucesso, erro HTTP e o wrapper `{ success: false }`. Cada teste
 * sobrescreve via `server.use(...)`; isto aqui é só uma resposta neutra de fallback.
 */
export const apiClientHandlers = [
    http.get('/api/test', () => HttpResponse.json({})),
    http.post('/api/test', () => HttpResponse.json({})),
];
