import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Zap, MessageSquareWarning, Target, FileText, Settings, X, Send, User } from 'lucide-react';
type AITool = 'copilot' | 'groq' | 'roleplay' | 'objections' | 'qualification' | 'playbook' | null;

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
}


const QUICK_ACTIONS: Record<string, string[]> = {
  copilot: ["Gerar e-mail frio para Diretoria", "Sugerir cadência de follow-up", "Criar pitch elevator de 30s"],
  groq: ["Análise de concorrentes locais", "Resuma os dados do cliente", "Melhorar tom de voz do e-mail"],
  objections: ["Tá muito caro", "Já temos contrato com fornecedor", "A matriz não deixa trocar", "Não temos tempo para implantação"],
  qualification: ["Gerar script BANT completo", "Gerar perguntas SPIN", "Quais as dores clássicas desse segmento?"],
  playbook: ["Regras de ICP de Logística", "O que a GR aprova/reprova?", "Níveis de maturidade do cliente"]
};

export function AIDockWidget() {
  const [activeTool, setActiveTool] = useState<AITool>(null);
  const [isDockExpanded, setIsDockExpanded] = useState(false);
  const [roleplayMode, setRoleplayMode] = useState<'voice'|'text'>('voice');
  
  // Chat States
  const [messages, setMessages] = useState<Record<string, Message[]>>({
    copilot: [{ id: '1', role: 'agent', content: 'Olá! Sou o Copiloto de Vendas. Envie o contexto do lead e diga o que você precisa.' }],
    groq: [{ id: '2', role: 'agent', content: 'Consulta rápida pronta. Para usar conhecimento interno, inclua o trecho do playbook na mensagem.' }],
    roleplay: [{ id: '3', role: 'agent', content: 'Pronto para simular uma call difícil. Qual seu pitch?' }],
    objections: [{ id: '4', role: 'agent', content: 'Qual objeção você encontrou? ("Tá caro", "Não tenho tempo", etc)' }],
    qualification: [{ id: '5', role: 'agent', content: 'Informe o segmento ou empresa que você vai ligar e gerarei as melhores perguntas BANT/SPIN.' }],
    playbook: [{ id: '6', role: 'agent', content: 'Qual filtro ou processo de playbook você deseja aplicar?' }],
  });
  
  const [inputs, setInputs] = useState<Record<string, string>>({
    copilot: '', groq: '', roleplay: '', objections: '', qualification: '', playbook: ''
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTool]);

  const sendMessage = async (text: string) => {
    if (!activeTool || !text.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    
    setMessages(prev => ({
        ...prev,
        [activeTool]: [...(prev[activeTool] || []), userMsg]
    }));
    
    setInputs(prev => ({ ...prev, [activeTool]: '' }));
    setIsLoading(true);

    try {
        let endpoint = '/api/agent/chat';
        if (activeTool === 'groq') endpoint = '/api/agent/groq';
        if (activeTool === 'roleplay') endpoint = '/api/agent/roleplay';
        if (activeTool === 'qualification') endpoint = '/api/agent/qualification';
        
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                message: text,
                tool: activeTool,
                history: (messages[activeTool] || []).slice(-10).map((message) => ({
                    role: message.role === 'agent' ? 'assistant' : 'user',
                    content: message.content,
                })),
            })
        });
        const data = await res.json();

        const replyText = res.ok && data.success
            ? data.reply
            : data.error || 'Não foi possível processar a solicitação.';
        
        setMessages(prev => ({
            ...prev,
            [activeTool]: [...(prev[activeTool] || []), { id: Date.now().toString(), role: 'agent', content: replyText }]
        }));
    } catch {
        setMessages(prev => ({
            ...prev,
            [activeTool]: [...(prev[activeTool] || []), { id: Date.now().toString(), role: 'agent', content: 'Não foi possível conectar ao motor de IA. Tente novamente.' }]
        }));
    } finally {
        setIsLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTool && inputs[activeTool]) {
       await sendMessage(inputs[activeTool]);
    }
  };

  const tools = [
      { id: 'copilot', icon: <Bot className="w-5 h-5" />, label: 'Atlas Copilot', color: 'bg-atlas-orange' },
      { id: 'groq', icon: <Zap className="w-5 h-5" />, label: 'Groq IA', color: 'bg-indigo-500' },
      { id: 'objections', icon: <MessageSquareWarning className="w-5 h-5" />, label: 'Objeções', color: 'bg-rose-500' },
      { id: 'qualification', icon: <Target className="w-5 h-5" />, label: 'Qualificação', color: 'bg-emerald-500' },
      { id: 'playbook', icon: <FileText className="w-5 h-5" />, label: 'Filtros Playbook', color: 'bg-sky-500' },
  ];

  const activeToolData = tools.find(t => t.id === activeTool);

  return (
    <>
      {/* Janela de Chat Ativa */}
      <AnimatePresence>
        {activeTool && activeToolData && (
          
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 w-96 h-[500px] max-h-[70vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 flex flex-col z-50 overflow-hidden"
          >
            {/* Header */}
            <div className={`${activeToolData.color} p-4 flex items-center justify-between`}>
              <div className="flex items-center gap-3 text-white">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  {activeToolData.icon}
                </div>
                <div>
                  <h3 className="font-bold text-sm">{activeToolData.label}</h3>
                  <p className="text-xs text-white/80">IA Engine Activo</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">

                <button onClick={() => setActiveTool(null)} className="text-white/80 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                </button>
              </div>

            </div>

            {/* Area de Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages[activeTool]?.map((msg, idx) => (
                <div key={msg.id} className="flex flex-col gap-2">
                    <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : `${activeToolData.color} bg-opacity-20 text-white`}`}>
                        {msg.role === 'user' ? <User className="w-4 h-4" /> : activeToolData.icon}
                      </div>
                      <div className={`p-3 rounded-2xl max-w-[75%] text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-100 dark:bg-white/5 text-gray-800 dark:text-gray-200 rounded-tl-none'}`}>
                        {msg.content}
                      </div>
                    </div>
                    {/* Render Quick Actions */}
                    {idx === 0 && messages[activeTool].length === 1 && QUICK_ACTIONS[activeTool] && (
                        <div className="flex flex-wrap gap-1.5 mt-2 ml-11">
                            {QUICK_ACTIONS[activeTool].map((action, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendMessage(action)}
                                    className={`text-[10px] font-semibold border ${activeToolData.color.replace('bg-', 'border-').replace('500', '400')} ${activeToolData.color.replace('bg-', 'text-').replace('500', '400')} bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-full transition-colors text-left`}
                                >
                                    {action}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className={`w-8 h-8 rounded-full ${activeToolData.color} bg-opacity-20 flex items-center justify-center`}>
                    <div className="animate-pulse">{activeToolData.icon}</div>
                  </div>
                  <div className="p-3 bg-gray-100 dark:bg-white/5 rounded-2xl rounded-tl-none flex items-center gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <div className="p-4 bg-gray-50 dark:bg-black/20 border-t border-gray-200 dark:border-white/10">
              <form onSubmit={handleSend} className="flex items-center gap-2">
                <input
                  type="text"
                  value={inputs[activeTool] || ''}
                  onChange={(e) => setInputs(prev => ({ ...prev, [activeTool]: e.target.value }))}
                  placeholder={`Mensagem para ${activeToolData.label}...`}
                  className="flex-1 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-atlas-orange transition-colors dark:text-white"
                />
                <button
                  type="submit"
                  disabled={!inputs[activeTool]?.trim() || isLoading}
                  className={`w-10 h-10 ${activeToolData.color} hover:opacity-80 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition-colors`}
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
            
          </motion.div>
        )}
      </AnimatePresence>

      {/* DOCK BAR Flutuante (Bottom Center) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-end justify-center">
        <motion.div 
            animate={{ width: isDockExpanded ? 'auto' : '64px', height: '64px' }}
            className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-gray-200/50 dark:border-white/10 rounded-full p-2 flex items-center gap-2 shadow-2xl overflow-hidden transition-all duration-300"
        >
            {/* Ícones do Dock (Só mostram se expandido) */}
            <AnimatePresence>
                {isDockExpanded && (
                    <motion.div 
                        initial={{ opacity: 0, width: 0 }} 
                        animate={{ opacity: 1, width: 'auto' }} 
                        exit={{ opacity: 0, width: 0 }}
                        className="flex items-center gap-2 pr-2 overflow-hidden"
                    >
                        {tools.map(tool => (
                            <button
                                key={tool.id}
                                onClick={() => setActiveTool(tool.id as AITool)}
                                className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-all hover:scale-110 active:scale-95 ${tool.color} shadow-lg relative group`}
                            >
                                {tool.icon}
                                {/* Tooltip */}
                                <span className="absolute -top-10 scale-0 group-hover:scale-100 transition-transform bg-gray-900 text-white text-xs font-bold px-3 py-1 rounded-lg whitespace-nowrap shadow-xl border border-white/10">
                                    {tool.label}
                                </span>
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Botão de Toggle do Dock */}
            <button
                onClick={() => setIsDockExpanded(!isDockExpanded)}
                className={`w-12 h-12 bg-slate-800 dark:bg-black rounded-full flex items-center justify-center text-white transition-all hover:bg-slate-700 shadow-xl shrink-0`}
            >
                <motion.div animate={{ rotate: isDockExpanded ? 180 : 0 }}>
                    <Settings className="w-6 h-6" />
                </motion.div>
            </button>
        </motion.div>
      </div>
    </>
  );
}
