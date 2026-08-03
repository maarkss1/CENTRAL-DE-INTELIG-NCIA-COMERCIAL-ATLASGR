import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, X, Globe, Send, RefreshCw, User, Target,
  AlertTriangle,
  Play, StopCircle, Award, Database, Flame, Copy, Check, Filter
} from 'lucide-react';
import { useBrand } from '../../../contexts/BrandContext';
import { Button } from '../../../components/ui/Button';
import { api } from '../../../lib/api';
import { BRAND_OBJECTIONS, BRAND_QUALIFICATIONS } from '../constants/brandMatrices';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  source?: 'internal' | 'web_search' | 'roleplay';
}

export function FloatingChatbook({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { activeBrand, brandInfo } = useBrand();
  const [activeTab, setActiveTab] = useState<'assistant' | 'roleplay' | 'playbook'>('assistant');
  const [searchMode, setSearchMode] = useState<'internal' | 'web_search' | 'roleplay'>('web_search');

  // Interactive Matrix Filter States
  const [selectedBrand, setSelectedBrand] = useState<'atlasgr' | 'totaltrac'>(activeBrand === 'totaltrac' ? 'totaltrac' : 'atlasgr');
  const [selectedSegment, setSelectedSegment] = useState<string>('todos');
  const [selectedPersona, setSelectedPersona] = useState<string>('todos');
  const [playbookView, setPlaybookView] = useState<'objections' | 'qualifications'>('objections');

  // Sync brand when activeBrand changes
  useEffect(() => {
    setSelectedBrand(activeBrand === 'totaltrac' ? 'totaltrac' : 'atlasgr');
  }, [activeBrand]);

  // Estado do assistente conversacional.
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'bot',
      text: `Olá! Sou o copiloto comercial da ${brandInfo.name}. Uso o motor Groq e a matriz interna da marca. Também posso responder com conhecimento geral, mas não tenho navegação web nem consulta de CNPJ em tempo real.`,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      source: 'web_search'
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([{
      id: `${activeBrand}-${Date.now()}`,
      sender: 'bot',
      text: `Olá! Sou o copiloto comercial da ${brandInfo.name}. Uso o motor Groq e a matriz interna da marca. Também posso responder com conhecimento geral, mas não tenho navegação web nem consulta de CNPJ em tempo real.`,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      source: 'web_search',
    }]);
  }, [activeBrand, brandInfo.name]);

  // State do Simulador de Roleplay
  const [roleplayPersona, setRoleplayPersona] = useState<'skeptical_cfo' | 'strict_buyer' | 'tech_director'>('skeptical_cfo');
  const [roleplayActive, setRoleplayActive] = useState(false);
  const [roleplayMessages, setRoleplayMessages] = useState<Array<{ sender: 'sdr' | 'buyer'; text: string }>>([]);
  const [roleplayInput, setRoleplayInput] = useState('');
  const [roleplayScore, setRoleplayScore] = useState<{ clarity: number; objectionHandling: number; total: number } | null>(null);
  const [roleplayFeedback, setRoleplayFeedback] = useState('');
  const [roleplayError, setRoleplayError] = useState('');
  const [isRoleplayThinking, setIsRoleplayThinking] = useState(false);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, roleplayMessages]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Envio de mensagem ao copiloto real, com contexto local opcional.
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || isSearching) return;

    const userText = inputQuery;
    setInputQuery('');

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsSearching(true);

    const queryLower = userText.toLowerCase();

    const matchedObjection = BRAND_OBJECTIONS.find((o) =>
      o.brand === selectedBrand && (
        queryLower.includes(o.segment.toLowerCase()) ||
        queryLower.includes(o.persona.toLowerCase()) ||
        queryLower.includes('objeção') ||
        queryLower.includes('caro') ||
        queryLower.includes('concorrente') ||
        queryLower.includes('rastreador') ||
        queryLower.includes('crm')
      )
    );

    const matchedQual = BRAND_QUALIFICATIONS.find((q) =>
      q.brand === selectedBrand && (
        queryLower.includes(q.framework.toLowerCase()) ||
        queryLower.includes('qualificar') ||
        queryLower.includes('pergunta') ||
        queryLower.includes(q.segment.toLowerCase())
      )
    );

    const localContext = searchMode === 'internal'
      ? [
          matchedObjection
            ? `MATRIZ DE OBJEÇÃO:\n${JSON.stringify(matchedObjection, null, 2)}`
            : '',
          matchedQual
            ? `MATRIZ DE QUALIFICAÇÃO:\n${JSON.stringify(matchedQual, null, 2)}`
            : '',
        ].filter(Boolean).join('\n\n')
      : '';

    try {
      const response = await api.post<{ result: { answer: string; webAccess: false } }>('/api/intelligence/studio', {
        kind: 'assistant',
        brand: {
          name: brandInfo.name,
          description: brandInfo.description,
        },
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
        source: searchMode,
      }]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Falha inesperada';
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: `Não consegui consultar o motor de IA agora. ${reason}`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        source: searchMode,
      }]);
    } finally {
      setIsSearching(false);
    }
  };

  // Roleplay Simulator Interactions extraídas das 100 objeções
  const startRoleplay = () => {
    setRoleplayActive(true);
    setRoleplayScore(null);
    setRoleplayFeedback('');
    setRoleplayError('');
    
    // Pega objeções da marca selecionada na base de 100
    const brandObjs = BRAND_OBJECTIONS.filter(o => o.brand === selectedBrand);
    const randomObj = brandObjs[Math.floor(Math.random() * brandObjs.length)];
    const objectionText = randomObj.objectionText.replace(/[.!?]+$/, '');

    let initialGreeting = '';
    if (roleplayPersona === 'skeptical_cfo') {
      initialGreeting = `Olá! Sou o CFO. Em nossa operação de ${randomObj.segment}, ${objectionText}. O que a sua solução traz de retorno financeiro para justificar a contratação?`;
    } else if (roleplayPersona === 'strict_buyer') {
      initialGreeting = `Boa tarde. Em nossa operação de ${randomObj.segment}, ${objectionText}. Por que deveríamos perder tempo avaliando o ${selectedBrand.toUpperCase()}?`;
    } else {
      initialGreeting = `Oi. Sou o Diretor Técnico. Falando como ${randomObj.persona}, a dor principal em ${randomObj.segment} é que ${objectionText}. Como vocês resolvem isso na prática?`;
    }

    setRoleplayMessages([{ sender: 'buyer', text: initialGreeting }]);
  };

  const handleRoleplaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleplayInput.trim() || !roleplayActive || isRoleplayThinking) return;

    const userText = roleplayInput;
    setRoleplayInput('');
    setRoleplayError('');
    setRoleplayFeedback('');
    const transcript = [...roleplayMessages, { sender: 'sdr' as const, text: userText }];
    setRoleplayMessages(transcript);
    setIsRoleplayThinking(true);

    const playbookContext = BRAND_OBJECTIONS
      .filter((item) => item.brand === selectedBrand)
      .slice(0, 3)
      .map((item) => JSON.stringify({
        segment: item.segment,
        persona: item.persona,
        objection: item.objectionText,
        responseGuidance: item.responseScript,
        differentiator: item.keyDifferentiator,
      }))
      .join('\n');

    try {
      const response = await api.post<{
        result: {
          reply: string;
          feedback: string;
          clarity: number;
          objectionHandling: number;
          total: number;
        };
      }>('/api/intelligence/studio', {
        kind: 'roleplay',
        brand: {
          name: brandInfo.name,
          description: brandInfo.description,
        },
        inputs: {
          persona: roleplayPersona,
          message: userText,
          transcript,
          playbookContext,
        },
      }, { timeoutMs: 90_000 });

      setRoleplayMessages((prev) => [...prev, { sender: 'buyer', text: response.result.reply }]);
      setRoleplayFeedback(response.result.feedback);
      setRoleplayScore({
        clarity: response.result.clarity,
        objectionHandling: response.result.objectionHandling,
        total: response.result.total,
      });
    } catch (error) {
      setRoleplayError(error instanceof Error ? error.message : 'Falha ao consultar o motor de IA');
    } finally {
      setIsRoleplayThinking(false);
    }
  };

  // Filtered Lists for Objections and Qualifications
  const filteredObjections = BRAND_OBJECTIONS.filter((item) => {
    if (item.brand !== selectedBrand) return false;
    if (selectedSegment !== 'todos' && !item.segment.toLowerCase().includes(selectedSegment.toLowerCase())) return false;
    if (selectedPersona !== 'todos' && !item.persona.toLowerCase().includes(selectedPersona.toLowerCase())) return false;
    return true;
  });

  const filteredQualifications = BRAND_QUALIFICATIONS.filter((item) => {
    if (item.brand !== selectedBrand) return false;
    if (selectedSegment !== 'todos' && !item.segment.toLowerCase().includes(selectedSegment.toLowerCase())) return false;
    if (selectedPersona !== 'todos' && !item.persona.toLowerCase().includes(selectedPersona.toLowerCase())) return false;
    return true;
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[999]"
          />

          {/* Master Omni-Drawer */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed top-0 right-0 h-full w-[540px] max-w-[95vw] bg-surface border-l border-line shadow-2xl z-[1000] flex flex-col overflow-hidden text-ink"
          >
            {/* Header Superior */}
            <div className="p-5 border-b border-line bg-surface backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-atlas-orange to-amber-500 flex items-center justify-center text-white shadow-lg shadow-atlas-orange/20">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-extrabold text-base text-ink tracking-tight">{brandInfo.name} Copilot</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                      Groq IA
                    </span>
                  </div>
                  <p className="text-xs text-ink-2">Assistente comercial com base interna; sem navegação web</p>
                </div>
              </div>

              <button
                onClick={onClose}
                aria-label="Fechar assistente"
                className="p-2 text-ink-2 hover:text-ink hover:bg-surface-2 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-atlas-orange"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selector de 3 Abas Principais */}
            <div className="flex border-b border-line bg-surface-2 p-1">
              <button
                onClick={() => setActiveTab('assistant')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'assistant' ? 'bg-atlas-orange text-white shadow-md font-extrabold' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <Globe className="w-4 h-4" /> Assistente IA
              </button>
              <button
                onClick={() => setActiveTab('roleplay')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'roleplay' ? 'bg-atlas-orange text-white shadow-md font-extrabold' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <User className="w-4 h-4" /> Roleplay Simulator
              </button>
              <button
                onClick={() => setActiveTab('playbook')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'playbook' ? 'bg-atlas-orange text-white shadow-md font-extrabold' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <Target className="w-4 h-4" /> Matrizes & Objeções
              </button>
            </div>

            {/* CONTEÚDO DA ABA 1: ASSISTENTE CONVERSACIONAL */}
            {activeTab === 'assistant' && (
              <div className="flex-1 flex flex-col min-h-0 bg-surface">
                {/* Mode Selector */}
                <div className="p-3 border-b border-line bg-surface-2 flex items-center justify-between text-xs">
                  <span className="text-ink-2 font-medium">Fonte de contexto:</span>
                  <div className="flex items-center gap-1.5 bg-surface-2 p-1 rounded-xl border border-line">
                    <button
                      onClick={() => setSearchMode('web_search')}
                      className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        searchMode === 'web_search' ? 'bg-indigo-600 text-white shadow-sm' : 'text-ink-2 hover:text-ink'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" /> IA geral (sem web)
                    </button>
                    <button
                      onClick={() => setSearchMode('internal')}
                      className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        searchMode === 'internal' ? 'bg-indigo-600 text-white shadow-sm' : 'text-ink-2 hover:text-ink'
                      }`}
                    >
                      <Database className="w-3.5 h-3.5" /> Base {brandInfo.name}
                    </button>
                  </div>
                </div>

                {/* Messages Chat List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[88%] p-4 rounded-2xl text-xs space-y-2 leading-relaxed shadow-md ${
                          msg.sender === 'user'
                            ? 'bg-atlas-orange text-white rounded-br-none font-medium'
                            : 'bg-surface-2 text-ink-2 border border-line rounded-bl-none'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] opacity-75 pb-1 border-b border-line">
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
                    <div className="flex items-center gap-2 text-xs text-indigo-400 bg-surface-2 p-3 rounded-2xl border border-line w-fit animate-pulse">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Consultando o motor Groq...</span>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input Prompt Footer */}
                <form onSubmit={handleSendMessage} className="p-4 border-t border-line bg-surface flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={searchMode === 'web_search' ? 'Pergunte à IA geral (sem dados da web em tempo real)...' : `Consulte a matriz comercial da ${brandInfo.name}...`}
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-surface-2 text-ink text-xs border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                  />
                  <Button type="submit" disabled={isSearching} size="sm" className="px-4 py-2.5 bg-atlas-orange text-white font-bold cursor-pointer">
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            )}

            {/* CONTEÚDO DA ABA 2: ROLEPLAY SANDBOX (COMPRADOR B2B) */}
            {activeTab === 'roleplay' && (
              <div className="flex-1 flex flex-col min-h-0 bg-surface p-4 space-y-4 overflow-y-auto">
                <div className="p-4 rounded-2xl bg-surface-2 border border-line space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                      <User className="w-4 h-4 text-amber-400" /> Selecione a Persona do Comprador B2B
                    </h3>
                    {roleplayActive && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 text-green-300 font-bold border border-green-500/30 flex items-center gap-1">
                        <Flame className="w-3 h-3 text-green-400 animate-pulse" /> Simulação Ativa
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
                    <button
                      onClick={() => setRoleplayPersona('skeptical_cfo')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        roleplayPersona === 'skeptical_cfo' ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold' : 'bg-surface border-line text-ink-2 hover:text-ink'
                      }`}
                    >
                      CFO Cético (Foco ROI)
                    </button>
                    <button
                      onClick={() => setRoleplayPersona('strict_buyer')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        roleplayPersona === 'strict_buyer' ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold' : 'bg-surface border-line text-ink-2 hover:text-ink'
                      }`}
                    >
                      Comprador Rígido
                    </button>
                    <button
                      onClick={() => setRoleplayPersona('tech_director')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        roleplayPersona === 'tech_director' ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold' : 'bg-surface border-line text-ink-2 hover:text-ink'
                      }`}
                    >
                      Diretor de TI
                    </button>
                  </div>

                  {!roleplayActive ? (
                    <Button onClick={startRoleplay} className="w-full py-2.5 font-bold cursor-pointer">
                      <Play className="w-4 h-4 mr-2" /> Iniciar Treinamento de Roleplay
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => setRoleplayActive(false)} className="w-full py-2.5 font-bold text-red-400 border-red-500/30 hover:bg-red-500/10 cursor-pointer">
                      <StopCircle className="w-4 h-4 mr-2" /> Encerrar Simulação
                    </Button>
                  )}
                </div>

                {roleplayScore && (
                  <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950 to-slate-900 border border-emerald-500/30 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-emerald-400" />
                      <div>
                        <span className="font-bold text-ink block">Feedback estimado pela IA</span>
                        <span className="text-[10px] text-ink-2">Clareza: {roleplayScore.clarity}% | Contorno de objeções: {roleplayScore.objectionHandling}%</span>
                        {roleplayFeedback && <span className="text-[10px] text-emerald-200 block mt-1">{roleplayFeedback}</span>}
                      </div>
                    </div>
                    <span className="text-lg font-black text-emerald-400">{roleplayScore.total}% estimado</span>
                  </div>
                )}

                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {roleplayMessages.map((msg, idx) => (
                    <div key={idx} className={`flex flex-col ${msg.sender === 'sdr' ? 'items-end' : 'items-start'}`}>
                      <div className={`p-3.5 rounded-2xl text-xs max-w-[88%] leading-relaxed ${
                        msg.sender === 'sdr' ? 'bg-indigo-600 text-white rounded-br-none font-medium' : 'bg-surface-2 text-amber-200 border border-amber-500/20 rounded-bl-none'
                      }`}>
                        <span className="font-bold text-[10px] block opacity-75 mb-1 uppercase">
                          {msg.sender === 'sdr' ? 'Você (SDR)' : `Comprador (${roleplayPersona.replace('_', ' ').toUpperCase()})`}
                        </span>
                        <p>{msg.text}</p>
                      </div>
                    </div>
                  ))}
                  {isRoleplayThinking && (
                    <div className="flex items-center gap-2 text-xs text-amber-300">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      O comprador simulado está analisando sua resposta...
                    </div>
                  )}
                  {roleplayError && (
                    <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-300">
                      Não foi possível continuar o roleplay: {roleplayError}
                    </div>
                  )}
                </div>

                {roleplayActive && (
                  <form onSubmit={handleRoleplaySubmit} className="flex items-center gap-2 pt-2 border-t border-line">
                    <input
                      type="text"
                      placeholder="Responda à pergunta do comprador..."
                      value={roleplayInput}
                      onChange={(e) => setRoleplayInput(e.target.value)}
                      disabled={isRoleplayThinking}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-surface-2 text-ink text-xs border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                    />
                    <Button type="submit" size="sm" disabled={isRoleplayThinking} className="px-4 py-2.5 bg-amber-500 text-slate-950 font-bold cursor-pointer">
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
                )}
              </div>
            )}

            {/* CONTEÚDO DA ABA 3: MATRIZES DE OBJEÇÕES E QUALIFICAÇÃO POR MARCA, SEGMENTO E PERSONA */}
            {activeTab === 'playbook' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-surface">
                {/* Seletores de Filtro Interativos */}
                <div className="glass-card p-4 rounded-2xl border border-line bg-surface-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                      <Filter className="w-4 h-4 text-atlas-orange" /> Filtros Avançados de Playbook
                    </span>
                    <div className="flex items-center gap-1 bg-surface p-1 rounded-xl border border-line text-xs">
                      <button
                        onClick={() => setPlaybookView('objections')}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          playbookView === 'objections' ? 'bg-atlas-orange text-white' : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        Objeções
                      </button>
                      <button
                        onClick={() => setPlaybookView('qualifications')}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          playbookView === 'qualifications' ? 'bg-atlas-orange text-white' : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        Qualificação
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {/* Seletor de Marca */}
                    <div>
                      <label className="font-bold text-ink-2 block mb-1 text-[10px] uppercase">Empresa / Marca</label>
                      <select
                        value={selectedBrand}
                        onChange={(e) => setSelectedBrand(e.target.value as 'atlasgr' | 'totaltrac')}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-surface text-ink font-bold border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                      >
                        <option value="atlasgr">AtlasGR (SaaS B2B)</option>
                        <option value="totaltrac">TotalTrac (Frotas/Risco)</option>
                      </select>
                    </div>

                    {/* Seletor de Segmento */}
                    <div>
                      <label className="font-bold text-ink-2 block mb-1 text-[10px] uppercase">Segmento</label>
                      <select
                        value={selectedSegment}
                        onChange={(e) => setSelectedSegment(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-surface text-ink border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                      >
                        <option value="todos">Todos os Segmentos</option>
                        {selectedBrand === 'atlasgr' ? (
                          <>
                            <option value="SaaS">SaaS & Tecnologia</option>
                            <option value="Indústria">Indústria & Manufatura</option>
                            <option value="Consultorias">Consultorias & Serviços</option>
                            <option value="Logística">Logística & Transportes</option>
                          </>
                        ) : (
                          <>
                            <option value="Transportadoras">Transportadoras & Logística</option>
                            <option value="Frotas">Frotas Corporativas</option>
                            <option value="Frigorificado">Transporte Frigorificado</option>
                            <option value="Agronegócio">Agronegócio & Máquinas</option>
                          </>
                        )}
                      </select>
                    </div>

                    {/* Seletor de Persona */}
                    <div>
                      <label className="font-bold text-ink-2 block mb-1 text-[10px] uppercase">Persona Decisora</label>
                      <select
                        value={selectedPersona}
                        onChange={(e) => setSelectedPersona(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-surface text-ink border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                      >
                        <option value="todos">Todas as Personas</option>
                        {selectedBrand === 'atlasgr' ? (
                          <>
                            <option value="VP de Vendas">VP / Diretor Comercial</option>
                            <option value="CFO">CFO / Financeiro</option>
                            <option value="Sales Ops">Head de Sales Ops</option>
                          </>
                        ) : (
                          <>
                            <option value="Diretor de Logística">Diretor de Logística</option>
                            <option value="Gerente de Frota">Gerente de Frota</option>
                            <option value="Gerente de Risco">Gerente de Risco (GR)</option>
                            <option value="CFO">CFO / Financeiro</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Exibição da Matriz de Objeções Filtradíssima */}
                {playbookView === 'objections' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-ink text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400" /> Objeções Mapeadas ({filteredObjections.length})
                      </h4>
                      <span className="text-[10px] text-ink-2">Marca: {selectedBrand.toUpperCase()}</span>
                    </div>

                    {filteredObjections.length === 0 ? (
                      <div className="text-center py-8 text-xs text-ink-2 bg-surface-2 rounded-2xl border border-line">
                        Nenhuma objeção encontrada para os filtros selecionados.
                      </div>
                    ) : (
                      filteredObjections.map((item) => (
                        <div key={item.id} className="glass-card p-4 rounded-2xl border border-line space-y-3 bg-surface-2">
                          <div className="flex items-center justify-between pb-2 border-b border-line">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-bold border border-red-500/30">
                                {item.segment}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                                {item.persona}
                              </span>
                            </div>
                            <button
                              onClick={() => handleCopy(item.responseScript, item.id)}
                              className="text-[11px] text-ink-2 hover:text-ink flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === item.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                              {copiedKey === item.id ? 'Copiado' : 'Copiar Resposta'}
                            </button>
                          </div>

                          <div>
                            <h5 className="font-bold text-ink text-xs mb-1">❓ Objeção: "{item.objectionTitle}"</h5>
                            <p className="text-ink-2 text-xs italic">"{item.objectionText}"</p>
                          </div>

                          <div className="p-3 rounded-xl bg-surface border border-line space-y-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block">💬 Script de Contorno (Recomendado)</span>
                            <p className="text-xs text-ink leading-relaxed font-medium">{item.responseScript}</p>
                          </div>

                          <p className="text-[11px] text-amber-400 font-bold">💡 Diferencial Chave: {item.keyDifferentiator}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Exibição da Matriz de Qualificação Filtradíssima */}
                {playbookView === 'qualifications' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-ink text-xs flex items-center gap-2">
                        <Target className="w-4 h-4 text-atlas-orange" /> Matriz de Qualificação ({filteredQualifications.length})
                      </h4>
                      <span className="text-[10px] text-ink-2">Marca: {selectedBrand.toUpperCase()}</span>
                    </div>

                    {filteredQualifications.length === 0 ? (
                      <div className="text-center py-8 text-xs text-ink-2 bg-surface-2 rounded-2xl border border-line">
                        Nenhuma pergunta de qualificação para os filtros selecionados.
                      </div>
                    ) : (
                      filteredQualifications.map((item) => (
                        <div key={item.id} className="glass-card p-4 rounded-2xl border border-line space-y-3 bg-surface-2">
                          <div className="flex items-center justify-between pb-2 border-b border-line">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] px-2 py-0.5 rounded bg-atlas-orange/20 text-atlas-orange font-bold border border-atlas-orange/30">
                                {item.framework} · {item.questionCategory}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                                {item.persona}
                              </span>
                            </div>
                            <button
                              onClick={() => handleCopy(item.questionText, item.id)}
                              className="text-[11px] text-ink-2 hover:text-ink flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === item.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                              {copiedKey === item.id ? 'Copiado' : 'Copiar Pergunta'}
                            </button>
                          </div>

                          <div>
                            <h5 className="font-bold text-ink text-xs mb-1">❓ Pergunta de Diagnóstico ({item.segment}):</h5>
                            <p className="text-ink text-xs font-semibold">{item.questionText}</p>
                          </div>

                          <div className="p-3 rounded-xl bg-surface border border-line space-y-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-300 block">🎯 Resposta Esperada / Sinal Amarelo</span>
                            <p className="text-xs text-ink-2 leading-relaxed">{item.idealAnswer}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
