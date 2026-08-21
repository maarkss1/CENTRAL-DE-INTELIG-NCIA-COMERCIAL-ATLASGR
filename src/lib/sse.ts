export interface SseEvent {
    event: string;
    data: string;
}

/**
 * Monta as opções de um `fetch` POST para um endpoint SSE — precisa ser fetch, não `EventSource`
 * (que só faz GET e não manda body de request). Mesmo padrão de auth (`credentials: 'include'` +
 * Bearer do localStorage) já usado em `src/lib/api.ts` e em `SwarmDashboard.tsx`.
 */
export function sseRequestInit(body: unknown, signal?: AbortSignal): RequestInit {
    const token = localStorage.getItem('token');
    return {
        method: 'POST',
        credentials: 'include',
        signal,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    };
}

/**
 * Consome um `Response` de um endpoint SSE por-requisição (`event: nome\ndata: json\n\n`, mesmo
 * framing de `/api/agent/swarm/stream`), entregando um evento por vez conforme os frames chegam.
 * Extraído do parser que já existia inline em `SwarmDashboard.tsx` para não duplicar pela
 * terceira vez (Chatbook e Relatórios IA são os outros dois consumidores).
 */
export async function readSseStream(response: Response, onEvent: (event: SseEvent) => void): Promise<void> {
    if (!response.ok) {
        throw new Error(`Falha ao iniciar streaming (HTTP ${response.status}).`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Streaming não suportado neste navegador.');

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';

        for (const frame of frames) {
            if (!frame.trim()) continue;

            let eventName = 'message';
            let dataStr = '';
            for (const line of frame.split('\n')) {
                if (line.startsWith('event: ')) eventName = line.slice(7).trim();
                else if (line.startsWith('data: ')) dataStr += line.slice(6);
            }
            if (!dataStr) continue;
            onEvent({ event: eventName, data: dataStr });
        }
    }
}
