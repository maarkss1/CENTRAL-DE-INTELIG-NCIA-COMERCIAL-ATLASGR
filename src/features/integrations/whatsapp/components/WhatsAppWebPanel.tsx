import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, MessageCircle, Send } from 'lucide-react';
import { useWhatsAppConversations, type WhatsAppConversationDto } from '../hooks/useWhatsAppConversations';
import { useWhatsAppMessages } from '../hooks/useWhatsAppMessages';

/** +5511999998888 -> +55 11 99999-8888 (best effort — só formatação de exibição, nunca usado para
 * decidir se um número é válido). */
function formatPhoneDisplay(e164: string): string {
    const digits = e164.replace(/\D/g, '');
    if (digits.length === 13) return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
    if (digits.length === 12) return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
    return e164;
}

/** "Agora", "há 5 min", "há 3h", ou data curta — texto curto o bastante pra caber ao lado do nome
 * na lista de conversas. */
function formatRelativeShort(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'agora';
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `há ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `há ${diffD}d`;
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function ConversationListItem({ conversation, active, onSelect }: {
    conversation: WhatsAppConversationDto;
    active: boolean;
    onSelect: () => void;
}) {
    const label = conversation.contactName || formatPhoneDisplay(conversation.phoneE164);
    const preview = conversation.lastMessageBody || '(mídia sem texto)';
    return (
        <button
            onClick={onSelect}
            aria-current={active ? 'true' : undefined}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-line transition-colors ${active ? 'bg-emerald-600/10' : 'hover:bg-surface-2'}`}
        >
            {/* Verde do WhatsApp: identidade de terceiro, não token de marca do produto — ver
                design-system/SKILL.md. */}
            <div className="w-10 h-10 rounded-full bg-emerald-600/15 text-emerald-500 flex items-center justify-center font-bold shrink-0">
                {label.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-ink truncate">{label}</p>
                    <span className="text-[11px] text-ink-2 shrink-0">{formatRelativeShort(conversation.lastMessageAt)}</span>
                </div>
                <p className="text-xs text-ink-2 truncate">
                    {conversation.lastMessageDirection === 'outbound' ? 'Você: ' : ''}{preview}
                </p>
            </div>
        </button>
    );
}

function ChatArea({ conversation, onBack }: { conversation: WhatsAppConversationDto; onBack: () => void }) {
    const { messages, loading, sending, error, sendMessage } = useWhatsAppMessages(conversation.phoneE164, true);
    const [text, setText] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const label = conversation.contactName || formatPhoneDisplay(conversation.phoneE164);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [messages]);

    const handleSend = async () => {
        const trimmed = text.trim();
        if (!trimmed) return;
        try {
            await sendMessage(trimmed);
            setText('');
        } catch {
            // Erro já fica disponível via `error` do hook, exibido abaixo do campo.
        }
    };

    return (
        <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-emerald-600/10 shrink-0">
                <button onClick={onBack} className="md:hidden text-ink-2 hover:text-ink p-1 -ml-1 shrink-0" aria-label="Voltar para a lista de conversas">
                    <ArrowLeft size={18} />
                </button>
                <div className="min-w-0">
                    <h3 className="font-bold text-ink text-sm truncate">{label}</h3>
                    <p className="text-[11px] text-ink-2 truncate">{formatPhoneDisplay(conversation.phoneE164)}</p>
                </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2 min-h-0">
                {loading && messages.length === 0 && !error && (
                    <div className="h-full flex items-center justify-center text-ink-2 gap-2 text-sm">
                        <Loader2 className="animate-spin" size={16} /> Carregando conversa...
                    </div>
                )}
                {!loading && error && messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-4">
                        <AlertTriangle className="text-amber-500" size={24} />
                        <p className="text-xs text-ink-2">{error}</p>
                    </div>
                )}
                {!loading && !error && messages.length === 0 && (
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

            <div className="p-3 border-t border-line shrink-0">
                {error && <p className="text-xs text-danger mb-2">{error}</p>}
                <div className="flex items-center gap-2">
                    <label htmlFor="whatsapp-web-message-input" className="sr-only">Mensagem</label>
                    <input
                        id="whatsapp-web-message-input"
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
                        aria-label="Enviar mensagem"
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white p-2.5 rounded-full transition-colors shrink-0"
                    >
                        {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * "WhatsApp Web" embutido na plataforma — o backend já usa Baileys (protocolo do WhatsApp Web) por
 * baixo; isto dá a esse fato uma UI condizente (lista de conversas + chat), em vez de só um cartão
 * de conectar/desconectar. Só renderiza quando `connected` — antes disso, Integrations.tsx mostra
 * o QR Code (ver seção "Conectar" da tela).
 */
export function WhatsAppWebPanel({ connected }: { connected: boolean }) {
    const { conversations, loading, error } = useWhatsAppConversations(connected);
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

    // Se a conversa selecionada some da lista (improvável, mas evita ficar preso numa seleção
    // órfã) ou nada está selecionado ainda, seleciona a mais recente automaticamente em telas
    // largas (md:) — em mobile o usuário escolhe explicitamente, pra não pular direto pro chat.
    useEffect(() => {
        if (selectedPhone && conversations.some((c) => c.phoneE164 === selectedPhone)) return;
        if (window.matchMedia('(min-width: 768px)').matches && conversations.length > 0) {
            setSelectedPhone(conversations[0].phoneE164);
        }
    }, [conversations, selectedPhone]);

    const selectedConversation = useMemo(
        () => conversations.find((c) => c.phoneE164 === selectedPhone) ?? null,
        [conversations, selectedPhone],
    );

    return (
        // Altura menor no mobile: o cabeçalho da tela (topbar + abas + status) já consome boa
        // parte de um viewport de ~700-850px — 600px fixos empurravam o campo de mensagem pra
        // abaixo da dobra, exigindo rolar a PÁGINA além de rolar a lista/chat internos.
        <div className="flex h-[440px] sm:h-[600px] max-h-[75vh] rounded-2xl border border-line overflow-hidden bg-surface shadow-sm">
            <div className={`w-full md:w-80 shrink-0 border-r border-line flex-col ${selectedPhone ? 'hidden md:flex' : 'flex'}`}>
                <div className="px-4 py-3 border-b border-line shrink-0">
                    <h3 className="text-sm font-bold text-ink">Conversas</h3>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loading && conversations.length === 0 && !error && (
                        <div className="h-full flex items-center justify-center text-ink-2 gap-2 text-sm">
                            <Loader2 className="animate-spin" size={16} /> Carregando conversas...
                        </div>
                    )}
                    {!loading && error && conversations.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-2">
                            <AlertTriangle className="text-amber-500" size={28} />
                            <p className="text-sm text-ink-2">Não foi possível carregar as conversas agora.</p>
                            <p className="text-xs text-ink-2">{error}</p>
                        </div>
                    )}
                    {!loading && !error && conversations.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-2">
                            <MessageCircle className="text-ink-2" size={28} />
                            <p className="text-sm text-ink-2">Nenhuma conversa ainda.</p>
                            <p className="text-xs text-ink-2">
                                O histórico do celular não é importado automaticamente — as conversas aparecem aqui a partir da próxima mensagem enviada ou recebida pelo WhatsApp da organização.
                            </p>
                        </div>
                    )}
                    {conversations.map((conv) => (
                        <ConversationListItem
                            key={conv.phoneE164}
                            conversation={conv}
                            active={conv.phoneE164 === selectedPhone}
                            onSelect={() => setSelectedPhone(conv.phoneE164)}
                        />
                    ))}
                </div>
            </div>

            <div className={`flex-1 min-w-0 ${selectedPhone ? 'flex' : 'hidden md:flex'}`}>
                {selectedConversation ? (
                    <ChatArea conversation={selectedConversation} onBack={() => setSelectedPhone(null)} />
                ) : (
                    <div className="flex-1 hidden md:flex flex-col items-center justify-center text-center p-8 gap-2">
                        <MessageCircle className="text-ink-2" size={32} />
                        <p className="text-sm text-ink-2">Selecione uma conversa à esquerda para ver as mensagens.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
