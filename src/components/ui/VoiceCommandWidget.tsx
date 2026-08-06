import { useState, useEffect } from 'react';
import { Mic, Sparkles, Volume2, Command, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBrand } from '../../contexts/BrandContext';
import { navigationBus } from '../../lib/navigationBus';
import { toast } from '../../lib/toast';


interface SpeechRecognitionEvent {
  results: { transcript: string }[][];
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function VoiceCommandWidget() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const { setActiveBrand } = useBrand();

  useEffect(() => {
    // Inicializa Web Speech API se suportado pelo navegador
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      const rec = new SpeechRecognitionAPI();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'pt-BR';

      rec.onresult = (event: SpeechRecognitionEvent) => {
        const currentText = Array.from(event.results as unknown as Iterable<{ transcript: string }[]>)
          .map((result) => result[0].transcript)
          .join('');
        
        setTranscript(currentText);

        // Processamento de Comandos de Voz em Português
        const textLower = currentText.toLowerCase();

        if (textLower.includes('crm') || textLower.includes('pipeline')) {
          navigationBus.requestTool('crm');
          setLastAction('Navegou para o CRM Board');
          stopListening();
        } else if (textLower.includes('prospector') || textLower.includes('buscar lead')) {
          navigationBus.requestTool('prospect');
          setLastAction('Navegou para o Prospector');
          stopListening();
        } else if (textLower.includes('atlas') || textLower.includes('atlas gr')) {
          setActiveBrand('atlasgr');
          setLastAction('Alternou para operação AtlasGR');
          stopListening();
        } else if (textLower.includes('total track') || textLower.includes('totaltrac')) {
          setActiveBrand('totaltrac');
          setLastAction('Alternou para operação TotalTrac');
          stopListening();
        } else if (textLower.includes('inteligência') || textLower.includes('metodologia')) {
          navigationBus.requestTool('intelligence');
          setLastAction('Abriu Estúdio de Inteligência');
          stopListening();
        } else if (textLower.includes('contato') || textLower.includes('contatos')) {
          navigationBus.requestTool('contacts');
          setLastAction('Navegou para Lista de Contatos');
          stopListening();
        } else if (textLower.includes('empresa') || textLower.includes('empresas')) {
          navigationBus.requestTool('companies');
          setLastAction('Navegou para Lista de Empresas');
          stopListening();
        }
      };

      rec.onerror = () => {
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      setRecognition(rec);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActiveBrand]);

  const toggleListening = () => {
    if (!recognition) {
      toast.error('Seu navegador não suporta reconhecimento de voz. Experimente usar o Google Chrome.');
      return;
    }

    if (isListening) {
      stopListening();
    } else {
      setTranscript('');
      setLastAction(null);
      setIsListening(true);
      try {
        recognition.start();
      } catch {
        toast.error('Ocorreu um erro no reconhecimento de voz.');
      }
    }
  };

  const stopListening = () => {
    setIsListening(false);
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        toast.error('Ocorreu um erro no reconhecimento de voz.');
      }
    }
  };

  return (
    <div className="fixed bottom-6 right-24 z-[900]">
      <div className="relative group">
        <button
          onClick={toggleListening}
          aria-label="Comando de Voz por Microfone"
          className={`flex items-center justify-center w-14 h-14 rounded-2xl text-white shadow-2xl transition-all duration-300 border border-line cursor-pointer ${
            isListening
              ? 'bg-red-600 animate-pulse ring-4 ring-red-500/40'
              : 'bg-gradient-to-br from-atlas-orange via-orange-400 to-white hover:scale-110 active:scale-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_10px_30px_rgba(255,86,24,0.5)]'
          }`}
        >
          {isListening ? (
            <Volume2 className="w-7 h-7 animate-bounce text-white" />
          ) : (
            <Mic className="w-7 h-7 group-hover:scale-110 transition-transform" />
          )}
        </button>

        {/* Tooltip Hover */}
        <div className="absolute right-16 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-surface text-ink text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl border border-line flex items-center gap-1.5">
          <Command className="w-3.5 h-3.5 text-atlas-orange" />
          <span>Comando por Voz ({isListening ? 'Ouvindo...' : 'Clique para Falar'})</span>
        </div>
      </div>

      {/* Painel de Transcrição e Feedback de Voz */}
      <AnimatePresence>
        {(isListening || lastAction || transcript) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-16 right-0 w-72 p-4 rounded-2xl bg-surface border border-atlas-orange/30 shadow-2xl backdrop-blur-xl text-xs space-y-2 z-50"
          >
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="font-extrabold text-atlas-orange flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-atlas-orange animate-pulse" /> Assistente de Voz B2B
              </span>
              <button onClick={() => { setTranscript(''); setLastAction(null); }} className="text-[10px] text-ink-2 hover:text-ink">
                Limpar
              </button>
            </div>

            {isListening && (
              <div className="space-y-1 text-center py-2">
                <p className="text-ink-2 italic animate-pulse">"Diga: CRM, Prospector, TotalTrac, Atlas..."</p>
                {transcript && <p className="text-ink font-bold bg-surface-2 p-2 rounded-xl border border-line">{transcript}</p>}
              </div>
            )}

            {lastAction && (
              <div className="p-2.5 rounded-xl bg-success/10 border border-success/30 text-success flex items-center gap-2">
                <Check className="w-4 h-4 text-success shrink-0" />
                <span className="font-bold">{lastAction}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
