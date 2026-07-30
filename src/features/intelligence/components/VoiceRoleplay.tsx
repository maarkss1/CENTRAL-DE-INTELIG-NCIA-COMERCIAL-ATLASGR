import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Settings2, Loader2, PlaySquare, StopCircle, X } from 'lucide-react';

export function VoiceRoleplay({ 
    onClose, 
    onSwitchToText 
}: { 
    onClose: () => void;
    onSwitchToText: () => void;
}) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    
    interface SpeechRecognitionEvent {
        resultIndex: number;
        results: { [key: number]: { [key: number]: { transcript: string } } };
    }
    interface ISpeechRecognition {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: (event: SpeechRecognitionEvent) => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
    }

    // Web Speech API refs
    const recognitionRef = useRef<ISpeechRecognition | null>(null);
    const synthRef = useRef<SpeechSynthesis | null>(null);

    // Audio Visualizer states
    const [audioData, setAudioData] = useState<number[]>(new Array(10).fill(10));

    useEffect(() => {
        if (typeof window !== 'undefined') {
            synthRef.current = window.speechSynthesis;
            const w = window as unknown as { SpeechRecognition?: new () => ISpeechRecognition, webkitSpeechRecognition?: new () => ISpeechRecognition };
            const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
            if (SpeechRecognition) {
                recognitionRef.current = new SpeechRecognition();
                recognitionRef.current.continuous = false;
                recognitionRef.current.interimResults = true;
                recognitionRef.current.lang = 'pt-BR';

                recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
                    const current = event.resultIndex;
                    const result = event.results[current][0].transcript;
                    setTranscript(result);
                };

                recognitionRef.current.onend = () => {
                    // When user stops speaking, automatically send
                    if (isListening) {
                        setIsListening(false);
                        handleProcessVoice();
                    }
                };
            }
        }
        return () => {
            if (synthRef.current) synthRef.current.cancel();
            if (recognitionRef.current) recognitionRef.current.stop();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isListening]);

    // Simulate audio visualizer when speaking or listening
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isListening || isSpeaking) {
            interval = setInterval(() => {
                setAudioData(Array.from({ length: 15 }, () => Math.floor(Math.random() * 40) + 10));
            }, 100);
        } else {
            setAudioData(new Array(15).fill(4));
        }
        return () => clearInterval(interval);
    }, [isListening, isSpeaking]);

    const toggleListen = () => {
        if (!recognitionRef.current) {
            alert('Reconhecimento de voz não suportado neste navegador. Use o Chrome.');
            return;
        }
        if (synthRef.current) synthRef.current.cancel();
        
        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
            handleProcessVoice();
        } else {
            setTranscript('');
            setAiResponse('');
            setIsListening(true);
            try {
                recognitionRef.current.start();
            } catch (e) {
                console.error(e);
            }
        }
    };

    const handleProcessVoice = async () => {
        if (!transcript.trim()) return;
        setIsProcessing(true);
        setAiResponse('');
        
        try {
            const res = await fetch('/api/agent/roleplay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: transcript,
                    history: []
                })
            });
            const data = await res.json();
            if (data.success) {
                setAiResponse(data.reply);
                speak(data.reply);
            } else {
                setAiResponse('Desculpe, ocorreu um erro de conexão.');
            }
        } catch (_error) {
            setAiResponse('Falha na comunicação com a IA.');
        } finally {
            setIsProcessing(false);
        }
    };

    const speak = (text: string) => {
        if (!synthRef.current) return;
        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.1; // Slightly faster for natural feel
        utterance.pitch = 0.9;
        
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        
        synthRef.current.speak(utterance);
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 text-white rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative">
            {/* Header */}
            <div className="flex justify-between items-center p-4 z-10 relative bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-fuchsia-500 animate-pulse" />
                    <span className="font-bold text-sm tracking-widest uppercase text-fuchsia-500">Live Roleplay</span>
                </div>
                <div className="flex gap-4 items-center">
                    <button onClick={onSwitchToText} className="text-[10px] uppercase font-bold text-gray-400 hover:text-white transition-colors">Modo Texto</button>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
                </div>
            </div>

            {/* Main Visualizer Area */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
                {/* Background glow */}
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-3xl transition-opacity duration-700 ${isSpeaking ? 'bg-fuchsia-600/30 opacity-100' : isListening ? 'bg-blue-600/30 opacity-100' : 'opacity-0'}`} />
                
                {/* Visualizer Bars */}
                <div className="flex items-center justify-center gap-1.5 h-32 relative z-10 mb-8">
                    {audioData.map((height, i) => (
                        <motion.div
                            key={i}
                            animate={{ height: `${height}px` }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                            className={`w-2 rounded-full ${isSpeaking ? 'bg-fuchsia-500' : isListening ? 'bg-blue-400' : 'bg-gray-600'}`}
                        />
                    ))}
                </div>

                {/* Subtitles / Transcript */}
                <div className="text-center w-full max-w-sm h-24 overflow-hidden relative z-10">
                    <AnimatePresence mode="wait">
                        {isProcessing ? (
                            <motion.p key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-gray-400 text-sm flex items-center justify-center gap-2">
                                <Loader2 size={16} className="animate-spin" /> Processando resposta...
                            </motion.p>
                        ) : isSpeaking ? (
                            <motion.p key="speaking" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-fuchsia-100 text-lg font-medium leading-tight">
                                "{aiResponse}"
                            </motion.p>
                        ) : isListening ? (
                            <motion.p key="listening" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-blue-100 text-lg font-medium leading-tight">
                                {transcript || "Ouvindo..."}
                            </motion.p>
                        ) : (
                            <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-gray-500 text-sm">
                                Toque no microfone para falar com o comprador virtual.
                            </motion.p>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Controls */}
            <div className="p-6 flex justify-center items-center gap-6 relative z-10 bg-gradient-to-t from-black/80 to-transparent">
                <button className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 transition-colors">
                    <Settings2 size={20} />
                </button>
                <button 
                    onClick={toggleListen}
                    disabled={isProcessing}
                    className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 disabled:opacity-50
                        ${isListening 
                            ? 'bg-blue-600 shadow-blue-600/50 scale-110' 
                            : isSpeaking 
                                ? 'bg-fuchsia-600 shadow-fuchsia-600/50' 
                                : 'bg-white text-black hover:bg-gray-200'}`}
                >
                    {isListening ? (
                        <StopCircle size={28} className="text-white" />
                    ) : isSpeaking ? (
                        <PlaySquare size={28} className="text-white" />
                    ) : (
                        <Mic size={28} />
                    )}
                </button>
                <button onClick={() => { if(synthRef.current) synthRef.current.cancel(); setIsSpeaking(false); }} className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 transition-colors">
                    <X size={20} />
                </button>
            </div>
        </div>
    );
}
