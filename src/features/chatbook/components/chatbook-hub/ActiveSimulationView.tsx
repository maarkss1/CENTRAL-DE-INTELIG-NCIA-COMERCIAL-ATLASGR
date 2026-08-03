import { RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Mic, MicOff, Send, PhoneOff } from 'lucide-react';
import type { Brand } from '../../../../contexts/BrandContext';
import type { Message, Persona } from './types';

export function ActiveSimulationView({
    simulationMode, activeBrand, currentPersonas, selectedPersona, messages, isThinking, isListening,
    inputMessage, setInputMessage, toggleListening, onSendMessage, onEndChat, callDuration, botSpeaking,
    onEndCall, messagesEndRef,
}: {
    simulationMode: 'text' | 'voice';
    activeBrand: Brand;
    currentPersonas: Persona[];
    selectedPersona: string;
    messages: Message[];
    isThinking: boolean;
    isListening: boolean;
    inputMessage: string;
    setInputMessage: (value: string) => void;
    toggleListening: () => void;
    onSendMessage: () => void;
    onEndChat: () => void;
    callDuration: string;
    botSpeaking: boolean;
    onEndCall: () => void;
    messagesEndRef: RefObject<HTMLDivElement | null>;
}) {
    return (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className={`bg-surface/80 backdrop-blur-xl rounded-[3rem] border border-line shadow-[0_20px_40px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col ${simulationMode === 'voice' ? 'h-[600px]' : 'h-[700px]'}`}>

            {/* MODO TEXTO: CHAT */}
            {simulationMode === 'text' && (
                <>
                    {/* Topbar do Chat */}
                    <div className="px-8 py-6 bg-surface/60 border-b border-line flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-[1.5rem] flex items-center justify-center shadow-lg ${activeBrand === 'totaltrac' ? 'bg-sky-100 text-sky-600' : 'bg-orange-100 text-orange-600'}`}>
                                <Bot className="w-7 h-7" />
                            </div>
                            <div>
                                <h3 className="font-black text-lg text-ink tracking-tight">
                                    {currentPersonas.find(p => p.id === selectedPersona)?.label || 'Lead'}
                                </h3>
                                <p className="text-sm font-medium text-ink-2 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    Online
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onEndChat}
                            className="px-6 py-2 bg-surface-2 hover:bg-line text-ink-2 font-bold rounded-xl transition-colors text-sm uppercase tracking-wider"
                        >
                            Encerrar
                        </button>
                    </div>

                    {/* Mensagens */}
                    <div className="flex-1 p-6 md:p-8 overflow-y-auto space-y-6 bg-surface-2/30">
                        <AnimatePresence>
                            {messages.map((m) => (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    key={m.id}
                                    className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-2xl px-6 py-4 rounded-[2rem] text-base leading-relaxed font-medium ${
                                            m.sender === 'user'
                                                ? activeBrand === 'totaltrac'
                                                    ? 'bg-sky-600 text-white rounded-br-md shadow-[0_10px_20px_rgba(2,132,199,0.2)]'
                                                    : 'bg-atlas-orange text-white rounded-br-md shadow-[0_10px_20px_rgba(249,115,22,0.2)]'
                                                : 'bg-surface text-ink border border-line rounded-bl-md shadow-sm'
                                        }`}
                                    >
                                        <p>{m.text}</p>
                                        <span className={`block text-[10px] mt-3 font-black uppercase tracking-wider ${m.sender === 'user' ? 'text-white/60 text-right' : 'text-ink-2'}`}>
                                            {m.timestamp}
                                        </span>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {isThinking && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                                <div className="bg-surface border border-line px-6 py-4 rounded-[2rem] rounded-bl-md shadow-sm text-sm font-medium text-ink-2 flex items-center gap-3">
                                    <div className="flex gap-1">
                                        <span className="w-2 h-2 rounded-full bg-ink-2/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-2 h-2 rounded-full bg-ink-2/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-2 h-2 rounded-full bg-ink-2/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                    Cliente está digitando...
                                </div>
                            </motion.div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input bar */}
                    <div className="p-6 bg-surface/80 backdrop-blur-md border-t border-line flex items-center gap-4">
                        <button
                            onClick={toggleListening}
                            className={`p-4 rounded-[1.5rem] transition-all shadow-sm ${
                                isListening
                                    ? 'bg-rose-100 text-rose-600 animate-pulse scale-105'
                                    : 'bg-surface-2 hover:bg-line text-ink-2'
                            }`}
                            title="Falar via Microfone"
                        >
                            {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                        </button>

                        <input
                            type="text"
                            value={inputMessage}
                            onChange={(e) => setInputMessage(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && onSendMessage()}
                            placeholder="Digite seu argumento de vendas ou fale no microfone..."
                            className="flex-1 bg-surface-2 border border-line rounded-[1.75rem] px-6 py-4 text-base font-medium focus:outline-none focus:border-current focus:ring-4 focus:ring-current/10 transition-all placeholder:text-ink-2"
                            style={{ color: activeBrand === 'totaltrac' ? '#0284c7' : '#ea580c' }}
                        />

                        <button
                            onClick={onSendMessage}
                            disabled={!inputMessage.trim() || isThinking}
                            className={`p-4 rounded-[1.5rem] text-white transition-all disabled:opacity-50 shadow-lg hover:scale-105 ${
                                activeBrand === 'totaltrac' ? 'bg-sky-600 hover:bg-sky-700 shadow-sky-600/25' : 'bg-atlas-orange hover:bg-orange-600 shadow-orange-600/25'
                            }`}
                        >
                            <Send className="w-6 h-6" />
                        </button>
                    </div>
                </>
            )}

            {/* MODO VOZ: LIGAÇÃO TELEFÔNICA */}
            {simulationMode === 'voice' && (
                <div className="flex-1 flex flex-col relative bg-[#0b0f19] text-white overflow-hidden">
                    <div className={`absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] ${activeBrand === 'totaltrac' ? 'from-sky-500 via-[#0b0f19] to-[#0b0f19]' : 'from-orange-500 via-[#0b0f19] to-[#0b0f19]'}`} />

                    <div className="flex-1 flex flex-col items-center justify-center relative z-10 space-y-12">
                        {/* Caller Info */}
                        <div className="text-center space-y-2">
                            <h3 className="text-3xl font-black tracking-tight">{currentPersonas.find(p => p.id === selectedPersona)?.label}</h3>
                            <p className="text-gray-400 font-medium font-mono text-lg">{callDuration}</p>
                        </div>

                        {/* Avatar Pulsante */}
                        <div className="relative">
                            {/* Pulse animations when bot is speaking */}
                            {botSpeaking && (
                                <>
                                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className={`absolute inset-0 rounded-full opacity-30 blur-md ${activeBrand === 'totaltrac' ? 'bg-sky-500' : 'bg-orange-500'}`} />
                                    <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className={`absolute inset-0 rounded-full opacity-10 blur-xl ${activeBrand === 'totaltrac' ? 'bg-sky-500' : 'bg-orange-500'}`} />
                                </>
                            )}

                            <div className="w-32 h-32 rounded-full bg-gray-800 border-4 border-gray-700 flex items-center justify-center relative z-10 shadow-2xl">
                                <Bot className={`w-16 h-16 ${botSpeaking ? (activeBrand === 'totaltrac' ? 'text-sky-400' : 'text-orange-400') : 'text-gray-400'}`} />
                            </div>
                        </div>

                        {/* Transcrição (Subtitles) */}
                        <div className="h-24 px-8 w-full max-w-2xl flex flex-col items-center justify-center text-center">
                            {isThinking && <p className="text-gray-500 italic">Analisando sua resposta...</p>}
                            {botSpeaking && (
                                <p className={`text-lg font-medium leading-relaxed ${activeBrand === 'totaltrac' ? 'text-sky-100' : 'text-orange-100'}`}>
                                    {messages.filter(m => m.sender === 'bot').pop()?.text}
                                </p>
                            )}
                            {isListening && (
                                <p className="text-lg font-medium leading-relaxed text-white">
                                    {inputMessage || "Ouvindo você..."}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Call Controls */}
                    <div className="p-8 pb-12 flex items-center justify-center gap-8 relative z-10 bg-gradient-to-t from-black/80 to-transparent">
                        {/* Microphone Toggle */}
                        <button
                            onClick={toggleListening}
                            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                                isListening
                                    ? 'bg-white text-gray-900 shadow-[0_0_30px_rgba(255,255,255,0.3)]'
                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                            }`}
                        >
                            {isListening ? <Mic className="w-8 h-8" /> : <MicOff className="w-8 h-8" />}
                        </button>

                        {/* Send Button (Only visible if there is input in voice mode) */}
                        <AnimatePresence>
                            {isListening && inputMessage.trim() && (
                                <motion.button
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    onClick={onSendMessage}
                                    className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-xl ${activeBrand === 'totaltrac' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-orange-600 hover:bg-orange-500'}`}
                                >
                                    <Send className="w-8 h-8 ml-1" />
                                </motion.button>
                            )}
                        </AnimatePresence>

                        {/* End Call */}
                        <button
                            onClick={onEndCall}
                            className="w-20 h-20 rounded-full flex items-center justify-center bg-rose-600 text-white hover:bg-rose-500 transition-all shadow-[0_0_30px_rgba(225,29,72,0.4)]"
                        >
                            <PhoneOff className="w-8 h-8" />
                        </button>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
