export async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const defaultHeaders = {
        'Content-Type': 'application/json',
    };
    
    // Check if there is an auth token in localStorage (if used)
    const token = localStorage.getItem('token');
    if (token) {
        (defaultHeaders as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutMs = Number((import.meta as any).env?.VITE_API_TIMEOUT_MS || 15_000);
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const signal = options?.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;

    let response: Response;
    try {
        response = await fetch(endpoint, {
            ...options,
            signal,
            credentials: 'include',
            headers: {
                ...defaultHeaders,
                ...options?.headers,
            }
        });
    } catch (error) {
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
    get: <T>(url: string, options?: RequestInit) => apiFetch<T>(url, { ...options, method: 'GET' }),
    post: <T>(url: string, body?: unknown, options?: RequestInit) => apiFetch<T>(url, { ...options, method: 'POST', body: JSON.stringify(body) }),
    put: <T>(url: string, body?: unknown, options?: RequestInit) => apiFetch<T>(url, { ...options, method: 'PUT', body: JSON.stringify(body) }),
    delete: <T>(url: string, options?: RequestInit) => apiFetch<T>(url, { ...options, method: 'DELETE' }),
};
