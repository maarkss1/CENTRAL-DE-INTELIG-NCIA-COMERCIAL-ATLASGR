import { useEffect, useRef, useState } from 'react';
import { X, Send, Loader2, MessageCircle, AlertTriangle } from 'lucide-react';
import { api } from '../../../../lib/api';
import { useWhatsAppMessages } from '../hooks/useWhatsAppMessages';

type ConnectionStatus = 'checking' | 'connected' | 'disconnected' | 'connecting';

export function WhatsAppChatPanel({
  phone,
  contactName,
  onClose,
}: {
  phone: string;
  contactName?: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Escape fecha; foco vai pro botão "Fechar conversa" ao abrir e volta pro controle que abriu
  // ao fechar — mesmo padrão já usado em ToolTechPopover.tsx. Este componente (diferente daquele)
  // já é montado/desmontado pelo pai conforme abre/fecha (LeadDetailDrawer.tsx), então o efeito
  // roda uma vez no mount e limpa no unmount, sem precisar reagir a uma prop de abertura.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkStatus = async () => {
      try {
        const data = await api.get<{ status: ConnectionStatus; qr: string | null }>(
          '/api/whatsapp/status',
        );
        if (!cancelled) setStatus(data.status);
      } catch {
        if (!cancelled) setStatus('disconnected');
      }
    };
    checkStatus();
    return () => {
      cancelled = true;
    };
  }, [phone]);

  const { messages, sending, error, sendMessage } = useWhatsAppMessages(
    phone,
    status === 'connected',
  );

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
      // Erro já fica disponível via `error` do hook, exibido abaixo.
    }
  };

  return (
    // Este wrapper faz duas coisas de propósito: centraliza o card (flex) E fecha ao clicar fora
    // dele. Não leva aria-hidden (diferente de um backdrop decorativo separado) porque ENVOLVE o
    // conteúdo real do modal, não é irmão dele — escondê-lo do teclado/leitor de tela esconderia
    // o modal inteiro. onClick aqui é conveniência de mouse/touch; o botão "Fechar conversa"
    // abaixo é um <button> real, já alcançável por Tab, então não falta caminho de teclado.
    // biome-ignore lint/a11y/noStaticElementInteractions: dismiss por overlay, ver comentário acima
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      {/* onClick aqui só interrompe a propagação pro backdrop (impede que um clique dentro do
          painel feche o modal) — não é uma interação em si, então não há ação nova pra dar
          suporte a teclado; o conteúdo interativo real (mensagens, input, botões) já é acessível
          normalmente dentro deste painel. role="dialog" abaixo também já satisfaz o linter sem
          precisar de biome-ignore aqui (diferente de antes desta correção). */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsapp-chat-panel-title"
        className="bg-surface border border-line rounded-2xl shadow-2xl w-full max-w-md h-[600px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-emerald-600/10">
          <div className="flex items-center gap-2 min-w-0">
            <MessageCircle className="text-emerald-400 shrink-0" size={20} />
            <div className="min-w-0">
              <h3 id="whatsapp-chat-panel-title" className="font-bold text-ink text-sm truncate">
                {contactName || 'WhatsApp'}
              </h3>
              <p className="text-[11px] text-ink-2 truncate">{phone}</p>
            </div>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Fechar conversa"
            className="text-ink-2 hover:text-ink p-1 shrink-0"
          >
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
              O WhatsApp da organização não está conectado. Vá em{' '}
              <strong>Integrações → WhatsApp</strong> e escaneie o QR Code antes de enviar
              mensagens.
            </p>
          </div>
        )}

        {status === 'connected' && (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {error && messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-4">
                  <AlertTriangle className="text-amber-500" size={24} />
                  <p className="text-xs text-ink-2">{error}</p>
                </div>
              )}
              {!error && messages.length === 0 && (
                <p className="text-center text-xs text-ink-2 mt-8">
                  Nenhuma mensagem ainda. Envie a primeira abaixo.
                </p>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${msg.direction === 'outbound' ? 'bg-emerald-600 text-white' : 'bg-surface-2 text-ink'}`}
                  >
                    {msg.body || <span className="italic opacity-70">(mídia sem texto)</span>}
                    <div
                      className={`text-[10px] mt-1 ${msg.direction === 'outbound' ? 'text-emerald-100/70' : 'text-ink-2'}`}
                    >
                      {new Date(msg.receivedAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-line">
              {error && <p className="text-xs text-danger-active dark:text-danger mb-2">{error}</p>}
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
                  aria-label="Enviar mensagem"
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
