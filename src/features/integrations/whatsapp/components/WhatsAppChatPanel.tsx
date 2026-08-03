import { useEffect, useRef, useState } from 'react';
import { X, Send, Loader2, MessageCircle, AlertTriangle } from 'lucide-react';
import { api } from '../../../../lib/api';

interface WhatsAppMessageDto {
    id: string;
    direction: 'inbound' | 'outbound';
    body: string | null;
    receivedAt: string;
}

type ConnectionStatus = 'checking' | 'connected' | 'disconnected' | 'connecting';

const POLL_INTERVAL_MS = 5000;

export function WhatsAppChatPanel({
    phone, contactName, onClose,
}: {
    phone: string;
    contactName?: string;
    onClose: () => void;
}) {
    const [status, setStatus] = useState<ConnectionStatus>('checking');
    const [messages, setMessages] = useState<WhatsAppMessageDto[]>([]);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        let interval: number | undefined;

        const loadMessages = async () => {
            try {
                const data = await api.get<WhatsAppMessageDto[]>(`/api/whatsapp/messages?phone=${encodeURIComponent(phone)}`);
                if (!cancelled) setMessages([...data].reverse());
            } catch {
                // Falha silenciosa no polling — não interrompe a conversa já carregada.
            }
        };

        const init = async () => {
            try {
                const data = await api.get<{ status: ConnectionStatus; qr: string | null }>('/api/whatsapp/status');
                if (cancelled) return;
                setStatus(data.status);
                if (data.status === 'connected') {
                    await loadMessages();
                    interval = window.setInterval(loadMessages, POLL_INTERVAL_MS);
                }
            } catch {
                if (!cancelled) setStatus('disconnected');
            }
        };

        init();
        return () => {
            cancelled = true;
            if (interval) window.clearInterval(interval);
        };
    }, [phone]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [messages]);

    const handleSend = async () => {
        const trimmed = text.trim();
        if (!trimmed || sending) return;
        setSending(true);
        setError(null);
        try {
            await api.post('/api/whatsapp/send', { number: phone, text: trimmed });
            setMessages((prev) => [...prev, { id: `local-${Date.now()}`, direction: 'outbound', body: trimmed, receivedAt: new Date().toISOString() }]);
            setText('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao enviar mensagem.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="bg-surface border border-line rounded-2xl shadow-2xl w-full max-w-md h-[600px] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-emerald-600/10">
                    <div className="flex items-center gap-2 min-w-0">
                        <MessageCircle className="text-emerald-400 shrink-0" size={20} />
                        <div className="min-w-0">
                            <h3 className="font-bold text-ink text-sm truncate">{contactName || 'WhatsApp'}</h3>
                            <p className="text-[11px] text-ink-2 truncate">{phone}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-ink-2 hover:text-ink p-1 shrink-0">
                        <X size={18} />
                    </button>
                </div>

                {status === 'checking' && (
                    <div className="flex-1 flex items-center justify-center text-ink-2 gap-2">
                        <Loader2 className="animate-spin" size={18} /> Verificando conexão...
                    </div>
                )}

                {(status === 'disconnected' || status === 'connecting') && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
                        <AlertTriangle className="text-amber-500" size={32} />
                        <p className="text-sm text-ink-2">
                            O WhatsApp da organização não está conectado. Vá em <strong>Integrações → WhatsApp</strong> e escaneie o QR Code antes de enviar mensagens.
                        </p>
                    </div>
                )}

                {status === 'connected' && (
                    <>
                        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                            {messages.length === 0 && (
                                <p className="text-center text-xs text-ink-2 mt-8">Nenhuma mensagem ainda. Envie a primeira abaixo.</p>
                            )}
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${msg.direction === 'outbound' ? 'bg-emerald-600 text-white' : 'bg-surface-2 text-ink'}`}>
                                        {msg.body || <span className="italic opacity-70">(mídia sem texto)</span>}
                                        <div className={`text-[10px] mt-1 ${msg.direction === 'outbound' ? 'text-emerald-100/70' : 'text-ink-2'}`}>
                                            {new Date(msg.receivedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-3 border-t border-line">
                            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                    placeholder="Digite uma mensagem..."
                                    className="flex-1 bg-surface-2 border border-line rounded-full px-4 py-2.5 text-sm text-ink outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={sending || !text.trim()}
                                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white p-2.5 rounded-full transition-colors shrink-0"
                                >
                                    {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
