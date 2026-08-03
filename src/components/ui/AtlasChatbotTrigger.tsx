import { lazy, Suspense, useState } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { useBrand } from '../../contexts/BrandContext';
import { useBrandAccent } from '../../hooks/useBrandAccent';

const FloatingChatbook = lazy(() =>
  import('../../features/chatbook/components/FloatingChatbook')
    .then((module) => ({ default: module.FloatingChatbook }))
);

export function AtlasChatbotTrigger() {
  const [isOpen, setIsOpen] = useState(false);
  const { brandInfo } = useBrand();
  const accent = useBrandAccent();

  return (
    <>
      {/* Botão Flutuante Omnipresente no Canto Inferior Direito */}
      <div className="fixed bottom-6 right-6 z-[900]">
        <button
          onClick={() => setIsOpen(true)}
          aria-label={`Abrir copiloto comercial da ${brandInfo.name}`}
          className={`group relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${accent.gradient} text-white ${accent.glow} hover:scale-110 active:scale-95 transition-all duration-300 border border-line cursor-pointer`}
        >
          <Bot className="w-7 h-7 group-hover:rotate-12 transition-transform duration-300" />
          
          {/* Indicador de disponibilidade do copiloto */}
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-success border-2 border-slate-950" />
          </span>

          {/* Tooltip Hover */}
          <div className="absolute right-16 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-surface text-ink text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl border border-line flex items-center gap-1.5">
            <Sparkles className={`w-3.5 h-3.5 ${accent.text} animate-pulse`} />
            <span>{brandInfo.name} Copilot · Groq IA</span>
          </div>
        </button>
      </div>

      {/* Slide-Over Drawer do Chatbot */}
      {isOpen && (
        <Suspense fallback={null}>
          <FloatingChatbook isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
