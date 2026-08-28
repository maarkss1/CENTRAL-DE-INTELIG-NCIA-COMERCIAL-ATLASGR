import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { readSseStream, SseEvent } from '../../../lib/sse';
import { Activity, AlertTriangle } from 'lucide-react';

interface FeedEvent {
  id: string;
  type: string;
  message: string;
  timestamp: Date;
}

export function RealtimeFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  // Antes desta correção, uma falha de conexão (token expirado, rede fora, 5xx) só ia pro
  // console — a tela continuava mostrando "Nenhuma atividade recente." para sempre, indistinguível
  // de "conectado e sem eventos ainda" (achado desta auditoria: estado de erro ausente/não
  // anunciável, ver AGENTS.md desta pasta). `retryToken` força o efeito a rodar de novo sem
  // duplicar toda a função de conexão dentro do handler do botão.
  const [connectionError, setConnectionError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const retry = useCallback(() => setRetryToken((t) => t + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const connect = async () => {
      setConnectionError(false);
      try {
        // Using GET because the sseRequestInit uses POST and we need GET.
        // Or we can just use EventSource.
        const token = localStorage.getItem('token');
        const response = await fetch('/api/events', {
          method: 'GET',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        });

        await readSseStream(response, (sseEvent: SseEvent) => {
          if (sseEvent.event === 'crm_event') {
            const payload = JSON.parse(sseEvent.data);
            let message = 'Evento recebido';
            if (payload.type === 'DEAL_WON') message = 'Negócio ganho!';
            else if (payload.type === 'DEAL_LOST') message = 'Negócio perdido/desqualificado.';
            else message = payload.type;

            const newEvent: FeedEvent = {
              id: Math.random().toString(36).substring(7),
              type: payload.type,
              message,
              timestamp: new Date(),
            };
            setEvents((prev) => [newEvent, ...prev].slice(0, 10)); // keep last 10
          }
        });
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        console.error('SSE Error:', err);
        setConnectionError(true);
      }
    };

    connect();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [retryToken]);

  return (
    <Card className="col-span-3">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center">
          <Activity
            className={`mr-2 h-4 w-4 ${connectionError ? 'text-ink-2' : 'text-green-500 animate-pulse'}`}
          />
          Feed em Tempo Real
        </CardTitle>
      </CardHeader>
      <CardContent>
        {connectionError ? (
          <div className="flex items-center justify-between gap-3" role="status">
            <div className="flex items-center gap-2 text-sm text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Feed em tempo real desconectado.
            </div>
            <button
              type="button"
              onClick={retry}
              className="text-xs font-bold text-red-300 hover:underline cursor-pointer shrink-0"
            >
              Tentar novamente
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            Nenhuma atividade recente.
          </div>
        ) : (
          <ul className="space-y-3">
            {events.map((ev) => (
              <li key={ev.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{ev.timestamp.toLocaleTimeString()}</span>
                <Badge variant={ev.type === 'DEAL_WON' ? 'success' : 'outline'}>{ev.message}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
