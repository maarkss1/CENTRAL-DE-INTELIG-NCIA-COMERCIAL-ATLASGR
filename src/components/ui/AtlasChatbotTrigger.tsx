import { useState } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { FloatingChatbook } from '../../features/chatbook/components/FloatingChatbook';

export function AtlasChatbotTrigger() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Botão Flutuante Omnipresente no Canto Inferior Direito */}
      <div className="fixed bottom-6 right-6 z-[900]">
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Abrir Assistente de Vendas com IA e Pesquisa Web"
          className="group relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-atlas-orange via-orange-400 to-white text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_10px_30px_rgba(255,86,24,0.5)] hover:scale-110 active:scale-95 transition-all duration-300 border border-white/20 cursor-pointer"
        >
          <Bot className="w-7 h-7 group-hover:rotate-12 transition-transform duration-300" />
          
          {/* Badge Indicador de IA Live */}
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-success border-2 border-slate-950" />
          </span>

          {/* Tooltip Hover */}
          <div className="absolute right-16 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl border border-white/10 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-atlas-orange animate-pulse" />
            <span>Atlas AI & Web Agent</span>
          </div>
        </button>
      </div>

      {/* Slide-Over Drawer do Chatbot */}
      <FloatingChatbook isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
