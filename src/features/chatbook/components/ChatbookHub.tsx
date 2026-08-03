import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Database, Globe, RefreshCw, Send, Sparkles } from 'lucide-react';
import { useBrand } from '../../../contexts/BrandContext';
import { api } from '../../../lib/api';
import { BRAND_OBJECTIONS, BRAND_QUALIFICATIONS } from '../constants/brandMatrices';

interface Message {
    id: string;
    sender: 'user' | 'bot';
    text: string;
    timestamp: string;
}

export function ChatbookHub() {
    const { activeBrand, brandInfo } = useBrand();
    const [searchMode, setSearchMode] = useState<'internal' | 'web_search'>('web_search');
    const [inputQuery, setInputQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [messages, setMessages] = useState<Message[]>([{
        id: '1',
        sender: 'bot',
        text: `Olá! Sou o copiloto comercial da ${brandInfo.name}. Uso o motor Groq e a matriz interna da marca. Também posso responder com conhecimento geral, mas não tenho navegação web nem consulta de CNPJ em tempo real.`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }]);

    useEffect(() => {
        setMessages([{
            id: `${activeBrand}-${Date.now()}`,
            sender: 'bot',
            text: `Olá! Sou o copiloto comercial da ${brandInfo.name}. Uso o motor Groq e a matriz interna da marca. Também posso responder com conhecimento geral, mas não tenho navegação web nem consulta de CNPJ em tempo real.`,
            timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        }]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeBrand]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputQuery.trim() || isSearching) return;

        const userText = inputQuery;
        setInputQuery('');

        setMessages((prev) => [...prev, {
            id: Date.now().toString(),
            sender: 'user',
            text: userText,
            timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        }]);
        setIsSearching(true);

        const queryLower = userText.toLowerCase();
        const matchedObjection = BRAND_OBJECTIONS.find((o) =>
            o.brand === activeBrand && (
                queryLower.includes(o.segment.toLowerCase()) ||
                queryLower.includes(o.persona.toLowerCase()) ||
                queryLower.includes('objeção') ||
                queryLower.includes('caro') ||
                queryLower.includes('concorrente')
            )
        );
        const matchedQual = BRAND_QUALIFICATIONS.find((q) =>
            q.brand === activeBrand && (
                queryLower.includes(q.framework.toLowerCase()) ||
                queryLower.includes('qualificar') ||
                queryLower.includes('pergunta') ||
                queryLower.includes(q.segment.toLowerCase())
            )
        );
        const localContext = searchMode === 'internal'
            ? [
                matchedObjection ? `MATRIZ DE OBJEÇÃO:\n${JSON.stringify(matchedObjection, null, 2)}` : '',
                matchedQual ? `MATRIZ DE QUALIFICAÇÃO:\n${JSON.stringify(matchedQual, null, 2)}` : '',
            ].filter(Boolean).join('\n\n')
            : '';

        try {
            const response = await api.post<{ result: { answer: string } }>('/api/intelligence/studio', {
                kind: 'assistant',
                brand: { name: brandInfo.name, description: brandInfo.description },
                inputs: {
                    question: userText,
                    mode: searchMode === 'internal' ? 'internal' : 'general',
                    localContext,
                },
            }, { timeoutMs: 90_000 });

            setMessages((prev) => [...prev, {
                id: (Date.now() + 1).toString(),
                sender: 'bot',
                text: response.result.answer,
                timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            }]);
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'Falha inesperada';
            setMessages((prev) => [...prev, {
                id: (Date.now() + 1).toString(),
                sender: 'bot',
                text: `Não consegui consultar o motor de IA agora. ${reason}`,
                timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            }]);
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto bg-transparent p-4 md:p-8 flex flex-col items-center relative overflow-hidden transition-colors duration-1000">
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-orange-400/10 blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-[120px] pointer-events-none" />

            <div className="w-full max-w-4xl space-y-8 pb-8 relative z-10 flex-1 flex flex-col">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-surface/70 backdrop-blur-2xl rounded-[2.5rem] p-8 border border-line shadow-[0_20px_40px_rgba(0,0,0,0.03)] flex items-center gap-4 relative overflow-hidden"
                >
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-atlas-orange to-amber-500 flex items-center justify-center text-white shadow-lg shadow-atlas-orange/20 shrink-0">
                        <Bot className="w-7 h-7" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-black text-ink tracking-tight">{brandInfo.name} Copilot</h1>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 font-bold border border-emerald-500/30 shrink-0">
                                Groq IA
                            </span>
                        </div>
                        <p className="text-sm text-ink-2 flex items-center gap-1.5">
                            <Sparkles size={12} className="text-amber-500" /> Assistente comercial com base interna da marca; sem navegação web em tempo real.
                        </p>
                    </div>
                </motion.div>

                <div className="bg-surface/80 rounded-[2rem] border border-line shadow-[0_20px_40px_rgba(0,0,0,0.03)] flex-1 flex flex-col overflow-hidden min-h-[500px]">
                    <div className="p-3 border-b border-line bg-surface-2 flex items-center justify-between text-xs">
                        <span className="text-ink-2 font-medium">Fonte de contexto:</span>
                        <div className="flex items-center gap-1.5 bg-surface p-1 rounded-xl border border-line">
                            <button
                                onClick={() => setSearchMode('web_search')}
                                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                                    searchMode === 'web_search' ? 'bg-indigo-600 text-white shadow-sm' : 'text-ink-2 hover:text-ink'
                                }`}
                            >
                                <Globe className="w-3.5 h-3.5" /> IA geral
                            </button>
                            <button
                                onClick={() => setSearchMode('internal')}
                                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                                    searchMode === 'internal' ? 'bg-indigo-600 text-white shadow-sm' : 'text-ink-2 hover:text-ink'
                                }`}
                            >
                                <Database className="w-3.5 h-3.5" /> Base {brandInfo.name}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                                <div
                                    className={`max-w-[85%] p-4 rounded-2xl text-sm space-y-2 leading-relaxed shadow-md ${
                                        msg.sender === 'user'
                                            ? 'bg-atlas-orange text-white rounded-br-none font-medium'
                                            : 'bg-surface-2 text-ink border border-line rounded-bl-none'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-3 text-[10px] opacity-75 pb-1 border-b border-current/10">
                                        <span className="font-bold uppercase tracking-wider">
                                            {msg.sender === 'user' ? 'Você' : `${brandInfo.name} Copilot`}
                                        </span>
                                        <span>{msg.timestamp}</span>
                                    </div>
                                    <p className="whitespace-pre-line">{msg.text}</p>
                                </div>
                            </div>
                        ))}

                        {isSearching && (
                            <div className="flex items-center gap-2 text-sm text-indigo-400 bg-surface-2 p-3 rounded-2xl border border-line w-fit animate-pulse">
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>Consultando o motor Groq...</span>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <form onSubmit={handleSendMessage} className="p-4 border-t border-line bg-surface flex items-center gap-2">
                        <input
                            type="text"
                            placeholder={searchMode === 'web_search' ? 'Pergunte à IA geral (sem dados da web em tempo real)...' : `Consulte a matriz comercial da ${brandInfo.name}...`}
                            value={inputQuery}
                            onChange={(e) => setInputQuery(e.target.value)}
                            className="flex-1 px-4 py-3 rounded-xl bg-surface-2 text-ink text-sm border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                        />
                        <button
                            type="submit"
                            disabled={isSearching || !inputQuery.trim()}
                            className="p-3 rounded-xl bg-atlas-orange text-white font-bold disabled:opacity-50 hover:bg-orange-600 transition-colors shrink-0"
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
