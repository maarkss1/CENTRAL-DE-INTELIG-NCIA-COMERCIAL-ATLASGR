import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Zap, ShieldAlert, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { Card, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';

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

    // Simulação do SSE (Server-Sent Events) via animação em cadeia
    const runSimulation = () => {
        if (!mission.trim()) return;
        setIsExecuting(true);
        setMessages([]);

        const steps = [
            { agent: 'supervisor', text: 'Analisando a complexidade da missão e roteando os especialistas...', delay: 500 },
            { agent: 'supervisor', text: '[ROUTING] Missão requer qualificação profunda. Acionando SDR Autônomo.', delay: 1500 },
            { agent: 'sdr', text: 'Analisando ICP e histórico vetorial (RAG). Fit alto detectado.', delay: 3000 },
            { agent: 'sdr', text: '[SDR Result] Sucesso: Lead Qualificado (Score 92/100).', delay: 4500 },
            { agent: 'supervisor', text: 'Recebi a qualificação. Direcionando ao BDR para pesquisa Multimodal e Quebra-Gelo.', delay: 6000 },
            { agent: 'bdr', text: 'Rodando DeepResearchService... Encontrei sinal de compra recente em notícias locais.', delay: 7500 },
            { agent: 'bdr', text: '[BDR Result] Quebra-gelo gerado: "Vi que expandiram a frota no RS recentemente. Parabéns!"', delay: 9000 },
            { agent: 'supervisor', text: 'Missão completa. Atualizando CRM e finalizando Enxame.', delay: 10500 },
        ];

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
    };

    const getAgentIcon = (agent: string) => {
        switch (agent) {
            case 'supervisor': return <ShieldAlert size={18} className="text-atlas-orange" />;
            case 'sdr': return <Bot size={18} className="text-info" />;
            case 'bdr': return <Zap size={18} className="text-success" />;
            case 'crm': return <Database size={18} className="text-purple-400" />;
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
            case 'supervisor': return 'bg-atlas-orange/10 border-atlas-orange/20';
            case 'sdr': return 'bg-info/10 border-info/20';
            case 'bdr': return 'bg-success/10 border-success/20';
            case 'crm': return 'bg-purple-500/10 border-purple-500/20';
            default: return 'bg-white/5 border-white/10';
        }
    };

    return (
        <Card variant="glass" padding="xl" className="border-atlas-orange/30 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-32 bg-atlas-orange/10 rounded-full blur-[120px] pointer-events-none" />
            
            <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-2xl bg-atlas-orange/20 border border-atlas-orange/40 flex items-center justify-center text-atlas-orange">
                    <Zap size={28} />
                </div>
                <div>
                    <CardTitle className="text-2xl text-white font-black">Swarm Orchestrator (Enxame de Agentes)</CardTitle>
                    <p className="text-gray-400 text-sm mt-1">Multi-agentes que colaboram entre si para resolver missões complexas.</p>
                </div>
            </div>

            <div className="flex gap-4 mb-8">
                <input 
                    type="text" 
                    value={mission}
                    onChange={(e) => setMission(e.target.value)}
                    placeholder="Descreva a missão (Ex: Qualifique o lead X e gere um email de prospecção)"
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-white text-sm focus:outline-none focus:border-atlas-orange/50 transition-colors placeholder:text-gray-600"
                    disabled={isExecuting}
                />
                <Button 
                    variant="brand" 
                    size="lg" 
                    onClick={runSimulation} 
                    disabled={isExecuting || !mission.trim()}
                    className="gap-2 px-8"
                >
                    {isExecuting ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                    {isExecuting ? 'Executando Enxame...' : 'Lançar Missão'}
                </Button>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                <AnimatePresence>
                    {messages.map((msg, i) => (
                        <motion.div 
                            key={msg.id}
                            initial={{ opacity: 0, y: 20, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            className={`p-4 rounded-xl border backdrop-blur-md flex gap-4 ${getAgentBg(msg.agent)}`}
                        >
                            <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center shrink-0 border border-white/5 shadow-inner">
                                {getAgentIcon(msg.agent)}
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-white font-bold text-sm tracking-wide">{getAgentName(msg.agent)}</span>
                                    <span className="text-gray-500 text-[10px] uppercase font-black tracking-widest">{msg.timestamp.toLocaleTimeString()}</span>
                                </div>
                                <p className="text-gray-300 text-sm leading-relaxed font-medium">
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
                        className="flex items-center gap-3 text-gray-500 text-sm font-semibold p-4"
                    >
                        <Loader2 size={16} className="animate-spin" /> Agentes pensando...
                    </motion.div>
                )}
            </div>
        </Card>
    );
}
