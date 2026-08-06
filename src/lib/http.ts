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

/**
 * Aplica um timeout a qualquer Promise que não aceite AbortSignal (ex: chamadas de SDKs de
 * terceiros que fazem fetch internamente sem expor essa opção). Diferente de fetchWithTimeout,
 * isto não cancela a operação original — só para de esperar por ela, para o chamador poder tratar
 * como falha em vez de travar indefinidamente.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new HttpTimeoutError(timeoutMs)), timeoutMs);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); },
        );
    });
}

