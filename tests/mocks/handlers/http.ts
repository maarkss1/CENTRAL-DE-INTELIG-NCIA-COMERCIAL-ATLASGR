import { HttpResponse } from 'msw';

/** Envelope padrão `{ success, data }` usado pela maioria das rotas de `/api/*` (ver `apiFetch` em `src/lib/api.ts`). */
export function ok<T>(data: T, init?: number | ResponseInit) {
    return HttpResponse.json({ success: true, data }, init);
}

/** Corpo de erro no formato que `apiFetch` sabe desembrulhar (`errorData.error`). Default 500. */
export function fail(message: string, status = 500) {
    return HttpResponse.json({ success: false, error: message }, { status });
}
