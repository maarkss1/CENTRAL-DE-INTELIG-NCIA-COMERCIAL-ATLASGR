import { http, HttpResponse } from 'msw';

/** API pública externa (GDELT) usada por `news.service.ts`. Default: nenhuma menção encontrada. */
export const gdeltHandlers = [
    http.get('https://api.gdeltproject.org/api/v2/doc/doc', () => HttpResponse.json({ articles: [] })),
];
