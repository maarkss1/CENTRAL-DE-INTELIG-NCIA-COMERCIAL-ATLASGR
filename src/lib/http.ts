export class HttpTimeoutError extends Error {
    constructor(public readonly timeoutMs: number) {
        super(`A requisição externa excedeu ${timeoutMs}ms`);
        this.name = 'HttpTimeoutError';
    }
}

export async function fetchWithTimeout(
    input: string | URL | Request,
    init: RequestInit = {},
    timeoutMs = 10_000
): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const signal = init.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal;

    try {
        return await fetch(input, { ...init, signal });
    } catch (error) {
        if (controller.signal.aborted) throw new HttpTimeoutError(timeoutMs);
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

