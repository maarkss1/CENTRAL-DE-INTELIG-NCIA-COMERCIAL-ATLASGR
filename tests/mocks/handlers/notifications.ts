import { http, HttpResponse } from 'msw';
import { ok } from './http';

export const notificationsHandlers = [
    http.get('/api/notifications', () => ok({ items: [], unread: 0 })),
    http.post('/api/notifications/:id/read', ({ params }) => ok({ id: String(params.id) })),
    http.post('/api/notifications/read-all', () => ok({ count: 0 })),
    http.delete('/api/notifications/:id', () => new HttpResponse(null, { status: 204 })),
];
