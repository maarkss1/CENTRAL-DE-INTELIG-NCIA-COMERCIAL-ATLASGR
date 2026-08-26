import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { readSseStream, SseEvent } from '../../../lib/sse';
import { Activity } from 'lucide-react';

interface FeedEvent {
    id: string;
    type: string;
    message: string;
    timestamp: Date;
}

export function RealtimeFeed() {
    const [events, setEvents] = useState<FeedEvent[]>([]);

    useEffect(() => {
        const controller = new AbortController();

        const connect = async () => {
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
                console.error('SSE Error:', err);
            }
        };

        connect();

        return () => {
            controller.abort();
        };
    }, []);

    return (
        <Card className="col-span-3">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium flex items-center">
                    <Activity className="mr-2 h-4 w-4 text-green-500 animate-pulse" />
                    Feed em Tempo Real
                </CardTitle>
            </CardHeader>
            <CardContent>
                {events.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma atividade recente.
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {events.map(ev => (
                            <li key={ev.id} className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">
                                    {ev.timestamp.toLocaleTimeString()}
                                </span>
                                <Badge variant={ev.type === 'DEAL_WON' ? 'success' : 'outline'}>
                                    {ev.message}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
