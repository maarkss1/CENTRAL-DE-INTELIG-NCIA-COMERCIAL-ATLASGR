import { http } from 'msw';
import { ok } from './http';

export const calendarHandlers = [
    http.get('/api/activities', () => ok([])),
    http.put('/api/activities/:id', () => ok({})),
];
