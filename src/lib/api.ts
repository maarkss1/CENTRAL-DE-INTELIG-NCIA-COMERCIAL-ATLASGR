export interface ApiRequestOptions extends RequestInit {
    timeoutMs?: number;
}

export async function apiFetch<T>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    // FormData (upload de arquivo) precisa que o navegador defina o Content-Type sozinho, com o
    // boundary do multipart — forçar 'application/json' aqui quebraria o parse no servidor.
    const isFormData = options?.body instanceof FormData;
    const defaultHeaders: Record<string, string> = isFormData ? {} : {
        'Content-Type': 'application/json',
    };

    // Check if there is an auth token in localStorage (if used)
    const token = localStorage.getItem('token');
    if (token) {
        (defaultHeaders as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs
        ?? Number(import.meta.env.VITE_API_TIMEOUT_MS || 15_000);
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const signal = options?.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;

    let response: Response;
    try {
        const requestOptions = { ...(options || {}) };
        delete requestOptions.timeoutMs;
        response = await fetch(endpoint, {
            ...requestOptions,
            signal,
            credentials: 'include',
            headers: {
                ...defaultHeaders,
                ...requestOptions.headers,
            }
        });
    } catch {
        if (controller.signal.aborted) {
            throw new Error('A API demorou demais para responder. Tente novamente.');
        }
        throw new Error('Não foi possível conectar ao servidor.');
    } finally {
        window.clearTimeout(timeout);
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || errorData?.message || `API request failed with status ${response.status}`);
    }

    // For 204 No Content
    if (response.status === 204) {
        return {} as T;
    }

    const data = await response.json();
    
    // Support standardized { success, data } format
    if (data && typeof data === 'object' && 'success' in data) {
        if (!data.success) {
            throw new Error(data.error || 'API request failed');
        }
        if ('meta' in data) {
            return { data: data.data, meta: data.meta } as T;
        }
        return data.data as T;
    }
    
    // Fallback for non-standardized endpoints (like /api/prospect or intelligence if they are not standardized yet)
    return data as T;
}

export const api = {
    get: <T>(url: string, options?: ApiRequestOptions) => apiFetch<T>(url, { ...options, method: 'GET' }),
    post: <T>(url: string, body?: unknown, options?: ApiRequestOptions) => apiFetch<T>(url, { ...options, method: 'POST', body: JSON.stringify(body) }),
    put: <T>(url: string, body?: unknown, options?: ApiRequestOptions) => apiFetch<T>(url, { ...options, method: 'PUT', body: JSON.stringify(body) }),
    delete: <T>(url: string, options?: ApiRequestOptions) => apiFetch<T>(url, { ...options, method: 'DELETE' }),
    /** Upload de arquivo (multipart/form-data) — ex.: OCR de imagem. Não usa JSON.stringify. */
    postForm: <T>(url: string, form: FormData, options?: ApiRequestOptions) => apiFetch<T>(url, { ...options, method: 'POST', body: form }),
};
