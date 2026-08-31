import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Bot, Mic, MicOff, Send, PhoneOff } from 'lucide-react';
import type { Brand } from '../../../../contexts/BrandContext';
import type { CallMessage, Persona } from './types';

// Fundo sempre escuro (independente do tema claro/escuro do resto do app): exceção justificada
// (CLAUDE.md §5) — a tela de ligação ativa é imersiva por design, seguindo a convenção de UI de
// chamada/videochamada (foco total, sem distração visual do restante da interface). `bg-slate-950`
// (escala real do Tailwind) substitui o hex cru `#0b0f19` anterior, mesmo efeito visual.
export function ActiveCallView({
  activeBrand,
  currentPersonas,
  selectedPersona,
  messages,
  isThinking,
  isListening,
  inputMessage,
  toggleListening,
  onSendMessage,
  callDuration,
  botSpeaking,
  onEndCall,
}: {
  activeBrand: Brand;
  currentPersonas: Persona[];
  selectedPersona: string;
  messages: CallMessage[];
  isThinking: boolean;
  isListening: boolean;
  inputMessage: string;
  toggleListening: () => void;
  onSendMessage: () => void;
  callDuration: string;
  botSpeaking: boolean;
  onEndCall: () => void;
}) {
  // AtlasGR usa --brand (laranja) direto; Total Trac usa --brand-2 (ciano de acento) em vez de
  // --brand (navy) porque o navy fica pouco visível como glow sobre fundo quase preto — mesma
  // técnica já usada em GlowChart.tsx/useBrandAccent.ts para o mesmo problema.
  const isAtlas = activeBrand !== 'totaltrac';
  const accentText = isAtlas ? 'text-brand' : 'text-brand-2';
  const accentBg = isAtlas ? 'bg-brand' : 'bg-brand-2';
  const accentFrom = isAtlas ? 'from-brand' : 'from-brand-2';
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-slate-950 text-white rounded-[3rem] border border-line shadow-[0_20px_40px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col h-[600px] relative"
    >
      <div
        className={`absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] ${accentFrom} via-slate-950 to-slate-950`}
      />

      <div className="flex-1 flex flex-col items-center justify-center relative z-10 space-y-12">
        <div className="text-center space-y-2">
          <h3 className="text-3xl font-black tracking-tight">
            {currentPersonas.find((p) => p.id === selectedPersona)?.label}
          </h3>
          <p className="text-gray-400 font-medium font-mono text-lg">{callDuration}</p>
        </div>

        <div className="relative">
          {botSpeaking && (
            <>
              <motion.div
                animate={reduceMotion ? undefined : { scale: [1, 1.2, 1] }}
                transition={reduceMotion ? undefined : { repeat: Infinity, duration: 1.5 }}
                className={`absolute inset-0 rounded-full opacity-30 blur-md ${accentBg}`}
              />
              <motion.div
                animate={reduceMotion ? undefined : { scale: [1, 1.4, 1] }}
                transition={reduceMotion ? undefined : { repeat: Infinity, duration: 1.5, delay: 0.2 }}
                className={`absolute inset-0 rounded-full opacity-10 blur-xl ${accentBg}`}
              />
            </>
          )}

          <div className="w-32 h-32 rounded-full bg-gray-800 border-4 border-gray-700 flex items-center justify-center relative z-10 shadow-2xl">
            <Bot className={`w-16 h-16 ${botSpeaking ? accentText : 'text-gray-400'}`} />
          </div>
        </div>

        <div className="h-24 px-8 w-full max-w-2xl flex flex-col items-center justify-center text-center">
          {isThinking && <p className="text-gray-500 italic">Analisando sua resposta...</p>}
          {botSpeaking && (
            <p className="text-lg font-medium leading-relaxed text-white">
              {messages.filter((m) => m.sender === 'bot').pop()?.text}
            </p>
          )}
          {isListening && (
            <p className="text-lg font-medium leading-relaxed text-white">
              {inputMessage || 'Ouvindo você...'}
            </p>
          )}
        </div>
      </div>

      <div className="p-8 pb-12 flex items-center justify-center gap-8 relative z-10 bg-gradient-to-t from-black/80 to-transparent">
        <button
          type="button"
          onClick={toggleListening}
          aria-label={isListening ? 'Desativar microfone' : 'Ativar microfone'}
          title={isListening ? 'Desativar microfone' : 'Ativar microfone'}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
            isListening
              ? 'bg-white text-gray-900 shadow-[0_0_30px_rgba(255,255,255,0.3)]'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
          }`}
        >
          {isListening ? <Mic className="w-8 h-8" /> : <MicOff className="w-8 h-8" />}
        </button>

        <AnimatePresence>
          {isListening && inputMessage.trim() && (
            <motion.button
              type="button"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              onClick={onSendMessage}
              aria-label="Enviar mensagem"
              title="Enviar mensagem"
              className="w-20 h-20 rounded-full flex items-center justify-center text-white shadow-xl bg-brand-active hover:bg-brand-2"
            >
              <Send className="w-8 h-8 ml-1" />
            </motion.button>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={onEndCall}
          aria-label="Encerrar ligação"
          title="Encerrar ligação"
          className="w-20 h-20 rounded-full flex items-center justify-center bg-rose-600 text-white hover:bg-rose-500 transition-all shadow-[0_0_30px_rgba(225,29,72,0.4)]"
        >
          <PhoneOff className="w-8 h-8" />
        </button>
      </div>
    </motion.div>
  );
}
