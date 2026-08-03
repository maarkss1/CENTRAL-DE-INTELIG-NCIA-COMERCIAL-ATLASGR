import { http, HttpResponse } from 'msw';

/** API pública externa (OpenStreetMap) usada por `nominatim.service.ts`. Default: nenhum resultado. */
export const nominatimHandlers = [
    http.get('https://nominatim.openstreetmap.org/search', () => HttpResponse.json([])),
];
