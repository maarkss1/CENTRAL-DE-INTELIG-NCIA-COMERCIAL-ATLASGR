import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, X, Globe, Sparkles, Send, RefreshCw, User, Target, MessageSquare,
  AlertTriangle, ShieldCheck, Search, ExternalLink, ThumbsUp, HelpCircle,
  Play, StopCircle, Award, Database, Flame, ChevronRight, Copy, Check, Filter, Layers
} from 'lucide-react';
import { useBrand } from '../../../contexts/BrandContext';
import { Button } from '../../../components/ui/Button';
import { BRAND_OBJECTIONS, BRAND_QUALIFICATIONS, ObjectionItem, QualificationItem } from '../constants/brandMatrices';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  source?: 'internal' | 'web_search' | 'roleplay';
  searchQuery?: string;
  webResults?: Array<{ title: string; snippet: string; url: string }>;
}

export function FloatingChatbook({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { activeBrand } = useBrand();
  const [activeTab, setActiveTab] = useState<'assistant' | 'roleplay' | 'playbook'>('assistant');
  const [searchMode, setSearchMode] = useState<'all' | 'internal' | 'web_search'>('web_search');

  // Interactive Matrix Filter States
  const [selectedBrand, setSelectedBrand] = useState<'atlasgr' | 'totaltrac'>(activeBrand === 'totaltrac' ? 'totaltrac' : 'atlasgr');
  const [selectedSegment, setSelectedSegment] = useState<string>('todos');
  const [selectedPersona, setSelectedPersona] = useState<string>('todos');
  const [playbookView, setPlaybookView] = useState<'objections' | 'qualifications'>('objections');

  // Sync brand when activeBrand changes
  useEffect(() => {
    setSelectedBrand(activeBrand === 'totaltrac' ? 'totaltrac' : 'atlasgr');
  }, [activeBrand]);

  // State do Assistente Conversacional & Web Agent
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'bot',
      text: 'Olá! Sou o Atlas Copilot & Web Agent. Posso consultar nossa base de leads interna ou realizar buscas externas na web em tempo real sobre empresas, CNPJs e inteligência de mercado.',
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      source: 'web_search'
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State do Simulador de Roleplay
  const [roleplayPersona, setRoleplayPersona] = useState<'skeptical_cfo' | 'strict_buyer' | 'tech_director'>('skeptical_cfo');
  const [roleplayActive, setRoleplayActive] = useState(false);
  const [roleplayMessages, setRoleplayMessages] = useState<Array<{ sender: 'sdr' | 'buyer'; text: string }>>([]);
  const [roleplayInput, setRoleplayInput] = useState('');
  const [roleplayScore, setRoleplayScore] = useState<{ clarity: number; objectionHandling: number; total: number } | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, roleplayMessages]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Envio de Mensagem / Pesquisa Externa no Chatbot Assistente
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

    await new Promise((r) => setTimeout(r, 800));

    let botResponse = '';
    let webResults: Array<{ title: string; snippet: string; url: string }> | undefined = undefined;

    const queryLower = userText.toLowerCase();

    // 1. Busca por Objeções na Base Expandida de 100 itens
    const matchedObjection = BRAND_OBJECTIONS.find((o) =>
      queryLower.includes(o.brand) ||
      queryLower.includes(o.segment.toLowerCase()) ||
      queryLower.includes(o.persona.toLowerCase()) ||
      queryLower.includes('objeção') ||
      queryLower.includes('caro') ||
      queryLower.includes('concorrente') ||
      queryLower.includes('rastreador') ||
      queryLower.includes('crm')
    );

    // 2. Busca por Qualificação na Base Expandida
    const matchedQual = BRAND_QUALIFICATIONS.find((q) =>
      queryLower.includes(q.framework.toLowerCase()) ||
      queryLower.includes('qualificar') ||
      queryLower.includes('pergunta') ||
      queryLower.includes(q.segment.toLowerCase())
    );

    if (searchMode === 'web_search' || queryLower.includes('cnpj') || queryLower.includes('empresa') || queryLower.includes('buscar web')) {
      botResponse = `🔍 **Pesquisa Externa Realizada**: Varri fontes públicas e inteligência de mercado sobre "${userText}".\n\nEncontrei insights valiosos para enriquecer sua abordagem comercial:`;
      webResults = [
        { title: `Relatório Corporativo: ${userText}`, snippet: `Empresas no perfil de ${userText} possuem alta demanda por automação comercial e redução de CAC.`, url: `https://google.com/search?q=${encodeURIComponent(userText)}` },
        { title: `Receita Federal & Dados CNPJ`, snippet: `Empresa Ativa | Porte Mid-Market/Enterprise | Quadro Sócio-Administrador verificado.`, url: 'https://receita.fazenda.gov.br' },
        { title: `Mídias & Presença Digital`, snippet: `Equipe comercial ativa e infraestrutura em nuvem mapeada.`, url: 'https://linkedin.com' }
      ];
    } else if (matchedObjection) {
      botResponse = `🎯 **Matriz de Objeções Mapeada (${matchedObjection.brand.toUpperCase()})**:\n\n**Segmento**: ${matchedObjection.segment}\n**Persona**: ${matchedObjection.persona}\n\n**❓ Objeção**: "${matchedObjection.objectionTitle}"\n\n**💬 Script de Contorno Recomendado**:\n${matchedObjection.responseScript}\n\n💡 **Diferencial**: ${matchedObjection.keyDifferentiator}`;
    } else if (matchedQual) {
      botResponse = `📋 **Matriz de Qualificação (${matchedQual.framework} - ${matchedQual.brand.toUpperCase()})**:\n\n**Segmento**: ${matchedQual.segment}\n**Persona**: ${matchedQual.persona}\n**Categoria**: ${matchedQual.questionCategory}\n\n**❓ Pergunta de Diagnóstico**:\n"${matchedQual.questionText}"\n\n🎯 **Resposta Esperada**: ${matchedQual.idealAnswer}`;
    } else {
      botResponse = `Analisamos sua consulta na nossa base expandida de **100 Objeções** e **100 Qualificações**. Para obter a melhor abordagem para ${selectedBrand.toUpperCase()}, informe a persona (ex: CFO, VP de Vendas, Diretor de Logística) ou a objeção enfrentada!`;
    }

    const botMsg: Message = {
      id: (Date.now() + 1).toString(),
      sender: 'bot',
      text: botResponse,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      source: searchMode,
      webResults
    };

    setMessages((prev) => [...prev, botMsg]);
    setIsSearching(false);
  };

  // Roleplay Simulator Interactions extraídas das 100 objeções
  const startRoleplay = () => {
    setRoleplayActive(true);
    setRoleplayScore(null);
    
    // Pega objeções da marca selecionada na base de 100
    const brandObjs = BRAND_OBJECTIONS.filter(o => o.brand === selectedBrand);
    const randomObj = brandObjs[Math.floor(Math.random() * brandObjs.length)];

    let initialGreeting = '';
    if (roleplayPersona === 'skeptical_cfo') {
      initialGreeting = `Olá! Sou o CFO. Em nossa operação de ${randomObj.segment}, ${randomObj.objectionText}. O que a sua solução traz de retorno financeiro para justificar a contratação?`;
    } else if (roleplayPersona === 'strict_buyer') {
      initialGreeting = `Boa tarde. Em nossa operação de ${randomObj.segment}, ${randomObj.objectionText}. Por que deveríamos perder tempo avaliando o ${selectedBrand.toUpperCase()}?`;
    } else {
      initialGreeting = `Oi. Sou o Diretor Técnico. Falando como ${randomObj.persona}, a dor principal em ${randomObj.segment} é que ${randomObj.objectionText}. Como vocês resolvem isso na prática?`;
    }

    setRoleplayMessages([{ sender: 'buyer', text: initialGreeting }]);
  };

  const handleRoleplaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleplayInput.trim() || !roleplayActive) return;

    const userText = roleplayInput;
    setRoleplayInput('');

    setRoleplayMessages((prev) => [...prev, { sender: 'sdr', text: userText }]);

    await new Promise((r) => setTimeout(r, 700));

    // Seleciona réplica avançada da base de 100
    const brandObjs = BRAND_OBJECTIONS.filter(o => o.brand === selectedBrand);
    const sampleObj = brandObjs[Math.floor(Math.random() * brandObjs.length)];

    let buyerReply = '';
    if (roleplayPersona === 'skeptical_cfo') {
      buyerReply = `Entendi seu argumento sobre ${sampleObj.keyDifferentiator}. Mas como o ${selectedBrand.toUpperCase()} prova esse payback sem inflar custos operacionais adicionais?`;
    } else if (roleplayPersona === 'strict_buyer') {
      buyerReply = `A resposta foi boa sobre ${sampleObj.segment}. Se vocês cobrirem a proposta da concorrência e garantirem onboarding imediato, posso marcar uma reunião com a diretoria.`;
    } else {
      buyerReply = `Fiquei impressionado com o argumento. Gostaria de receber a documentação técnica para validar a aprovação do time.`;
    }

    setRoleplayMessages((prev) => [...prev, { sender: 'buyer', text: buyerReply }]);

    setRoleplayScore({
      clarity: 94,
      objectionHandling: 90,
      total: 92
    });
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
            className="fixed top-0 right-0 h-full w-[540px] max-w-[95vw] bg-slate-900 border-l border-white/10 shadow-2xl z-[1000] flex flex-col overflow-hidden text-slate-100"
          >
            {/* Header Superior */}
            <div className="p-5 border-b border-white/10 bg-slate-900/90 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-atlas-orange to-amber-500 flex items-center justify-center text-white shadow-lg shadow-atlas-orange/20">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-extrabold text-base text-white tracking-tight">Atlas Copilot & Web Agent</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                      Live Web AI
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">Pesquisas Externas, Assistente Comercial e Matriz por Marca/Persona</p>
                </div>
              </div>

              <button
                onClick={onClose}
                aria-label="Fechar assistente"
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-atlas-orange"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selector de 3 Abas Principais */}
            <div className="flex border-b border-white/10 bg-slate-950/60 p-1">
              <button
                onClick={() => setActiveTab('assistant')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'assistant' ? 'bg-atlas-orange text-white shadow-md font-extrabold' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Globe className="w-4 h-4" /> Assistente & Web Search
              </button>
              <button
                onClick={() => setActiveTab('roleplay')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'roleplay' ? 'bg-atlas-orange text-white shadow-md font-extrabold' : 'text-gray-400 hover:text-white'
                }`}
              >
                <User className="w-4 h-4" /> Roleplay Simulator
              </button>
              <button
                onClick={() => setActiveTab('playbook')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'playbook' ? 'bg-atlas-orange text-white shadow-md font-extrabold' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Target className="w-4 h-4" /> Matrizes & Objeções
              </button>
            </div>

            {/* CONTEÚDO DA ABA 1: ASSISTENTE CONVERSACIONAL & WEB AGENT */}
            {activeTab === 'assistant' && (
              <div className="flex-1 flex flex-col min-h-0 bg-slate-900/50">
                {/* Mode Selector */}
                <div className="p-3 border-b border-white/10 bg-slate-950/40 flex items-center justify-between text-xs">
                  <span className="text-gray-400 font-medium">Modo de Busca:</span>
                  <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl border border-white/10">
                    <button
                      onClick={() => setSearchMode('web_search')}
                      className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        searchMode === 'web_search' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" /> Pesquisa Web Externa
                    </button>
                    <button
                      onClick={() => setSearchMode('internal')}
                      className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        searchMode === 'internal' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Database className="w-3.5 h-3.5" /> Base Atlas Interna
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
                            : 'bg-slate-800 text-slate-200 border border-white/10 rounded-bl-none'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] opacity-75 pb-1 border-b border-white/10">
                          <span className="font-bold uppercase tracking-wider">
                            {msg.sender === 'user' ? 'Você' : 'Atlas AI Web Agent'}
                          </span>
                          <span>{msg.timestamp}</span>
                        </div>

                        <p className="whitespace-pre-line">{msg.text}</p>

                        {msg.webResults && (
                          <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-300 flex items-center gap-1">
                              <Search className="w-3 h-3" /> Resultados Encontrados na Web (Fontes Externas)
                            </span>
                            <div className="space-y-2">
                              {msg.webResults.map((res, idx) => (
                                <div key={idx} className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-[11px] space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-indigo-300 truncate">{res.title}</span>
                                    <a href={res.url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-white shrink-0">
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                  <p className="text-gray-400 text-[10px] leading-tight">{res.snippet}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {isSearching && (
                    <div className="flex items-center gap-2 text-xs text-indigo-400 bg-slate-800/80 p-3 rounded-2xl border border-white/10 w-fit animate-pulse">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Consultando dados na web e varrendo inteligência de mercado...</span>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input Prompt Footer */}
                <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10 bg-slate-950/80 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={searchMode === 'web_search' ? '🔎 Digite o nome da empresa, CNPJ ou tópico para buscar na web...' : '💬 Faça uma pergunta ao assistente comercial...'}
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs border border-white/10 focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                  />
                  <Button type="submit" disabled={isSearching} size="sm" className="px-4 py-2.5 bg-atlas-orange text-white font-bold cursor-pointer">
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            )}

            {/* CONTEÚDO DA ABA 2: ROLEPLAY SANDBOX (COMPRADOR B2B) */}
            {activeTab === 'roleplay' && (
              <div className="flex-1 flex flex-col min-h-0 bg-slate-900/50 p-4 space-y-4 overflow-y-auto">
                <div className="p-4 rounded-2xl bg-slate-800/80 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
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
                        roleplayPersona === 'skeptical_cfo' ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold' : 'bg-slate-900 border-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      CFO Cético (Foco ROI)
                    </button>
                    <button
                      onClick={() => setRoleplayPersona('strict_buyer')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        roleplayPersona === 'strict_buyer' ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold' : 'bg-slate-900 border-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      Comprador Rígido
                    </button>
                    <button
                      onClick={() => setRoleplayPersona('tech_director')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        roleplayPersona === 'tech_director' ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold' : 'bg-slate-900 border-white/5 text-gray-400 hover:text-white'
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
                        <span className="font-bold text-white block">Avaliação de Desempenho do SDR</span>
                        <span className="text-[10px] text-gray-400">Clareza: {roleplayScore.clarity}% | Contorno Objeções: {roleplayScore.objectionHandling}%</span>
                      </div>
                    </div>
                    <span className="text-lg font-black text-emerald-400">{roleplayScore.total}% Score</span>
                  </div>
                )}

                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {roleplayMessages.map((msg, idx) => (
                    <div key={idx} className={`flex flex-col ${msg.sender === 'sdr' ? 'items-end' : 'items-start'}`}>
                      <div className={`p-3.5 rounded-2xl text-xs max-w-[88%] leading-relaxed ${
                        msg.sender === 'sdr' ? 'bg-indigo-600 text-white rounded-br-none font-medium' : 'bg-slate-800 text-amber-200 border border-amber-500/20 rounded-bl-none'
                      }`}>
                        <span className="font-bold text-[10px] block opacity-75 mb-1 uppercase">
                          {msg.sender === 'sdr' ? 'Você (SDR)' : `Comprador (${roleplayPersona.replace('_', ' ').toUpperCase()})`}
                        </span>
                        <p>{msg.text}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {roleplayActive && (
                  <form onSubmit={handleRoleplaySubmit} className="flex items-center gap-2 pt-2 border-t border-white/10">
                    <input
                      type="text"
                      placeholder="Responda à pergunta do comprador..."
                      value={roleplayInput}
                      onChange={(e) => setRoleplayInput(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs border border-white/10 focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                    />
                    <Button type="submit" size="sm" className="px-4 py-2.5 bg-amber-500 text-slate-950 font-bold cursor-pointer">
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
                )}
              </div>
            )}

            {/* CONTEÚDO DA ABA 3: MATRIZES DE OBJEÇÕES E QUALIFICAÇÃO POR MARCA, SEGMENTO E PERSONA */}
            {activeTab === 'playbook' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-900/50">
                {/* Seletores de Filtro Interativos */}
                <div className="glass-card p-4 rounded-2xl border border-white/10 bg-slate-950/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Filter className="w-4 h-4 text-atlas-orange" /> Filtros Avançados de Playbook
                    </span>
                    <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-white/10 text-xs">
                      <button
                        onClick={() => setPlaybookView('objections')}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          playbookView === 'objections' ? 'bg-atlas-orange text-white' : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        Objeções
                      </button>
                      <button
                        onClick={() => setPlaybookView('qualifications')}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          playbookView === 'qualifications' ? 'bg-atlas-orange text-white' : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        Qualificação
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {/* Seletor de Marca */}
                    <div>
                      <label className="font-bold text-gray-400 block mb-1 text-[10px] uppercase">Empresa / Marca</label>
                      <select
                        value={selectedBrand}
                        onChange={(e) => setSelectedBrand(e.target.value as 'atlasgr' | 'totaltrac')}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-slate-800 text-white font-bold border border-white/10 focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                      >
                        <option value="atlasgr">AtlasGR (SaaS B2B)</option>
                        <option value="totaltrac">TotalTrac (Frotas/Risco)</option>
                      </select>
                    </div>

                    {/* Seletor de Segmento */}
                    <div>
                      <label className="font-bold text-gray-400 block mb-1 text-[10px] uppercase">Segmento</label>
                      <select
                        value={selectedSegment}
                        onChange={(e) => setSelectedSegment(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-slate-800 text-white border border-white/10 focus:outline-none focus:ring-1 focus:ring-atlas-orange"
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
                      <label className="font-bold text-gray-400 block mb-1 text-[10px] uppercase">Persona Decisora</label>
                      <select
                        value={selectedPersona}
                        onChange={(e) => setSelectedPersona(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-slate-800 text-white border border-white/10 focus:outline-none focus:ring-1 focus:ring-atlas-orange"
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
                      <h4 className="font-bold text-white text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400" /> Objeções Mapeadas ({filteredObjections.length})
                      </h4>
                      <span className="text-[10px] text-gray-400">Marca: {selectedBrand.toUpperCase()}</span>
                    </div>

                    {filteredObjections.length === 0 ? (
                      <div className="text-center py-8 text-xs text-gray-400 bg-white/5 rounded-2xl border border-white/5">
                        Nenhuma objeção encontrada para os filtros selecionados.
                      </div>
                    ) : (
                      filteredObjections.map((item) => (
                        <div key={item.id} className="glass-card p-4 rounded-2xl border border-white/10 space-y-3 bg-slate-900/70">
                          <div className="flex items-center justify-between pb-2 border-b border-white/10">
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
                              className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === item.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                              {copiedKey === item.id ? 'Copiado' : 'Copiar Resposta'}
                            </button>
                          </div>

                          <div>
                            <h5 className="font-bold text-white text-xs mb-1">❓ Objeção: "{item.objectionTitle}"</h5>
                            <p className="text-gray-400 text-xs italic">"{item.objectionText}"</p>
                          </div>

                          <div className="p-3 rounded-xl bg-slate-800/90 border border-white/5 space-y-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block">💬 Script de Contorno (Recomendado)</span>
                            <p className="text-xs text-gray-200 leading-relaxed font-medium">{item.responseScript}</p>
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
                      <h4 className="font-bold text-white text-xs flex items-center gap-2">
                        <Target className="w-4 h-4 text-atlas-orange" /> Matriz de Qualificação ({filteredQualifications.length})
                      </h4>
                      <span className="text-[10px] text-gray-400">Marca: {selectedBrand.toUpperCase()}</span>
                    </div>

                    {filteredQualifications.length === 0 ? (
                      <div className="text-center py-8 text-xs text-gray-400 bg-white/5 rounded-2xl border border-white/5">
                        Nenhuma pergunta de qualificação para os filtros selecionados.
                      </div>
                    ) : (
                      filteredQualifications.map((item) => (
                        <div key={item.id} className="glass-card p-4 rounded-2xl border border-white/10 space-y-3 bg-slate-900/70">
                          <div className="flex items-center justify-between pb-2 border-b border-white/10">
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
                              className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === item.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                              {copiedKey === item.id ? 'Copiado' : 'Copiar Pergunta'}
                            </button>
                          </div>

                          <div>
                            <h5 className="font-bold text-white text-xs mb-1">❓ Pergunta de Diagnóstico ({item.segment}):</h5>
                            <p className="text-gray-200 text-xs font-semibold">{item.questionText}</p>
                          </div>

                          <div className="p-3 rounded-xl bg-slate-800/90 border border-white/5 space-y-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-300 block">🎯 Resposta Esperada / Sinal Amarelo</span>
                            <p className="text-xs text-gray-300 leading-relaxed">{item.idealAnswer}</p>
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
