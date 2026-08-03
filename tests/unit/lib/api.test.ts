import { describe, it, expect, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { api } from '@/lib/api';
import { server } from '../../mocks/server';

describe('API Client', () => {
    afterEach(() => {
        server.resetHandlers();
    });

    it('should successfully get data using api.get', async () => {
        const mockData = { id: 1, name: 'Test' };
        let seenMethod: string | undefined;
        server.use(
            http.get('/api/test', ({ request }) => {
                seenMethod = request.method;
                return HttpResponse.json(mockData);
            }),
        );

        const result = await api.get('/api/test');
        expect(seenMethod).toBe('GET');
        expect(result).toEqual(mockData);
    });

    it('should successfully post data with success wrapper', async () => {
        const mockResponse = { success: true, data: { id: 1 } };
        let seenMethod: string | undefined;
        let seenBody: unknown;
        server.use(
            http.post('/api/test', async ({ request }) => {
                seenMethod = request.method;
                seenBody = await request.json();
                return HttpResponse.json(mockResponse);
            }),
        );

        const result = await api.post('/api/test', { name: 'Test' });
        expect(seenMethod).toBe('POST');
        expect(seenBody).toEqual({ name: 'Test' });
        expect(result).toEqual({ id: 1 });
    });

    it('should throw error when response is not ok', async () => {
        server.use(
            http.get('/api/test', () => HttpResponse.json({ error: 'Bad Request' }, { status: 400 })),
        );

        await expect(api.get('/api/test')).rejects.toThrow('Bad Request');
    });

    it('should throw error when success wrapper returns false', async () => {
        server.use(
            http.get('/api/test', () => HttpResponse.json({ success: false, error: 'Logic Error' })),
        );

        await expect(api.get('/api/test')).rejects.toThrow('Logic Error');
    });
});
