import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Zap, ShieldAlert, Database, Loader2, Send } from 'lucide-react';
import { Card } from '../../../components/ui/Card';

import { api } from '../../../lib/api';

interface SwarmMessage {
    id: string;
    agent: 'supervisor' | 'sdr' | 'bdr' | 'crm';
    text: string;
    timestamp: Date;
    status: 'thinking' | 'done';
}

export function SwarmDashboard() {
    const [mission, setMission] = useState('');
    const [isExecuting, setIsExecuting] = useState(false);
    const [messages, setMessages] = useState<SwarmMessage[]>([]);

    const runSimulation = async () => {
        if (!mission.trim()) return;
        setIsExecuting(true);
        setMessages([]);

        try {
            // Chamada Real ao Backend LangGraph
            const response = await api.post<{ messages: string[] }>('/api/agent/swarm/mission', { mission });
            
            if (response && response.messages) {
                const apiMessages: string[] = response.messages;
                
                const steps = apiMessages.map((msgStr, index) => {
                    let agent = 'supervisor';
                    if (msgStr.includes('[SDR Result]')) agent = 'sdr';
                    else if (msgStr.includes('[BDR Result]')) agent = 'bdr';
                    else if (msgStr.includes('[CRM Result]')) agent = 'crm';
                    
                    return { agent, text: msgStr, delay: (index + 1) * 2000 };
                });

                steps.forEach((step, index) => {
                    setTimeout(() => {
                        setMessages(prev => {
                            const newMsg: SwarmMessage = {
                                id: Math.random().toString(),
                                agent: step.agent as any,
                                text: step.text,
                                timestamp: new Date(),
                                status: 'done'
                            };
                            return [...prev, newMsg];
                        });

                        if (index === steps.length - 1) {
                            setIsExecuting(false);
                        }
                    }, step.delay);
                });
            } else {
                setIsExecuting(false);
            }
        } catch (error) {
            console.error('Falha ao executar Enxame:', error);
            setIsExecuting(false);
        }
    };

    const getAgentIcon = (agent: string) => {
        switch (agent) {
            case 'supervisor': return <ShieldAlert size={18} className="text-[#FF5A00]" />;
            case 'sdr': return <Bot size={18} className="text-[#00C2FF]" />;
            case 'bdr': return <Zap size={18} className="text-[#00FF9D]" />;
            case 'crm': return <Database size={18} className="text-[#B554FF]" />;
            default: return <Bot size={18} />;
        }
    };

    const getAgentName = (agent: string) => {
        switch (agent) {
            case 'supervisor': return 'Supervisor (Orquestrador)';
            case 'sdr': return 'SDR Autônomo';
            case 'bdr': return 'BDR (Outbound)';
            case 'crm': return 'Gestor de CRM';
            default: return 'Agente';
        }
    };

    const getAgentBg = (agent: string) => {
        switch (agent) {
            case 'supervisor': return 'bg-[#FF5A00]/[0.08] border-[#FF5A00]/20 text-[#FF5A00]';
            case 'sdr': return 'bg-[#00C2FF]/[0.08] border-[#00C2FF]/20 text-[#00C2FF]';
            case 'bdr': return 'bg-[#00FF9D]/[0.08] border-[#00FF9D]/20 text-[#00FF9D]';
            case 'crm': return 'bg-[#B554FF]/[0.08] border-[#B554FF]/20 text-[#B554FF]';
            default: return 'bg-white/5 border-white/10 text-white';
        }
    };

    return (
        <div className="flex flex-col h-[750px] bg-[#0A0A0A] rounded-3xl border border-white/10 overflow-hidden shadow-2xl relative">
            {/* Efeitos Glow Premium de Fundo */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#FF5A00]/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#00C2FF]/10 rounded-full blur-[120px] pointer-events-none" />

            {/* Cabeçalho */}
            <div className="px-8 py-6 border-b border-white/10 bg-white/[0.02] backdrop-blur-xl flex items-center justify-between z-10">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF5A00] to-[#FF8A00] flex items-center justify-center text-white shadow-lg shadow-[#FF5A00]/20">
                        <Zap size={24} fill="currentColor" />
                    </div>
                    <div>
                        <h2 className="text-xl text-white font-black tracking-tight">Swarm Orchestrator</h2>
                        <p className="text-gray-400 text-sm mt-0.5 font-medium">Rede Neural de Multi-Agentes</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="flex h-3 w-3 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
                    </span>
                    <span className="text-xs font-bold text-success uppercase tracking-widest">Enxame Online</span>
                </div>
            </div>

            {/* Área de Mensagens (Chat) */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar z-10">
                {messages.length === 0 && !isExecuting && (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                        <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
                            <Bot size={32} className="text-gray-400" />
                        </div>
                        <h3 className="text-white text-lg font-bold mb-2">Aguardando Missão</h3>
                        <p className="text-gray-400 text-sm max-w-sm">Descreva o que os agentes devem fazer e eles se organizarão automaticamente para executar.</p>
                    </div>
                )}

                <AnimatePresence>
                    {messages.map((msg) => (
                        <motion.div 
                            key={msg.id}
                            initial={{ opacity: 0, y: 15, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            className={`flex gap-4 ${msg.agent === 'supervisor' ? 'ml-0 mr-12' : 'ml-12 mr-0'}`}
                        >
                            <div className="w-12 h-12 rounded-xl bg-black/60 flex items-center justify-center shrink-0 border border-white/10 shadow-xl backdrop-blur-md">
                                {getAgentIcon(msg.agent)}
                            </div>
                            <div className={`p-5 rounded-2xl border backdrop-blur-xl shadow-lg flex-1 ${getAgentBg(msg.agent)}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-bold text-sm tracking-wide">{getAgentName(msg.agent)}</span>
                                    <span className="text-white/40 text-[10px] uppercase font-black tracking-widest">{msg.timestamp.toLocaleTimeString()}</span>
                                </div>
                                <p className="text-white/90 text-[15px] leading-relaxed font-medium whitespace-pre-wrap">
                                    {msg.text}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
                
                {isExecuting && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        className="flex items-center gap-3 text-[#FF5A00] text-sm font-bold p-4 bg-[#FF5A00]/10 border border-[#FF5A00]/20 rounded-xl w-fit ml-16"
                    >
                        <Loader2 size={16} className="animate-spin" /> Processando missão...
                    </motion.div>
                )}
            </div>

            {/* Input Footer */}
            <div className="p-6 bg-black/80 border-t border-white/10 backdrop-blur-2xl relative z-50">
                <div className="relative max-w-4xl mx-auto">
                    <input 
                        type="text" 
                        value={mission}
                        onChange={(e) => setMission(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isExecuting && mission.trim()) runSimulation();
                        }}
                        placeholder="O que você deseja que o Swarm faça? (Clique aqui para digitar)"
                        className="w-full bg-white/10 border border-white/20 rounded-2xl pl-6 pr-20 py-5 text-white text-[16px] font-medium focus:outline-none focus:border-[#FF5A00] focus:ring-1 focus:ring-[#FF5A00]/50 focus:bg-white/15 transition-all placeholder:text-gray-400 shadow-inner relative z-50 pointer-events-auto"
                        disabled={isExecuting}
                        autoFocus
                    />
                    <button 
                        onClick={runSimulation}
                        disabled={isExecuting || !mission.trim()}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 bg-gradient-to-r from-[#FF5A00] to-[#FF8A00] hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed rounded-xl flex items-center justify-center text-white transition-all shadow-lg z-50 pointer-events-auto"
                    >
                        {isExecuting ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} className="ml-1" />}
                    </button>
                </div>
                <p className="text-center text-gray-500 text-xs mt-4 font-bold uppercase tracking-widest">
                    Pressione <kbd className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-gray-300 mx-1 border border-white/10">Enter</kbd> para enviar a missão
                </p>
            </div>
        </div>
    );
}
