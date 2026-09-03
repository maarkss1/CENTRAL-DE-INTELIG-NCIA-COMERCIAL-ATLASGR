import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  X,
  Globe,
  Send,
  RefreshCw,
  User,
  Target,
  AlertTriangle,
  Play,
  StopCircle,
  Award,
  Database,
  Flame,
  Copy,
  Check,
  Filter,
  Mic,
  ArrowUpRight,
  Link2,
} from 'lucide-react';
import { useBrand } from '../../../contexts/BrandContext';
import { Button } from '../../../components/ui/Button';
import { useAssistantChat } from '../../../hooks/useAssistantChat';
import { useRoleplaySimulator } from '../../../hooks/useRoleplaySimulator';
import { usePlaybookMatrixFilters } from '../../../hooks/usePlaybookMatrixFilters';
import { usePlaybookMatrixData } from '../../../hooks/usePlaybookMatrixData';

interface FloatingChatbookProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Drawer global do copiloto, montado em toda tela autenticada via `AtlasChatbotTrigger` e
 * acionável de qualquer lugar (botão flutuante ou ⌘K → "Chamar copiloto de IA"). A aba
 * "Assistente IA" usa `useAssistantChat`, a mesma fonte única de estado/histórico consumida pela
 * página cheia `/app/chatbook` (`ChatbookHub`) — as duas são o mesmo copiloto, não implementações
 * duplicadas. Ver TRUST_BLOCKERS_ROADMAP.md P1-5.
 */
export function FloatingChatbook({ isOpen, onClose }: FloatingChatbookProps) {
  const navigate = useNavigate();
  const { activeBrand, brandInfo } = useBrand();
  const [activeTab, setActiveTab] = useState<'assistant' | 'roleplay' | 'playbook'>('assistant');

  // Compartilhado entre as 3 abas (assistente, roleplay e filtro de matrizes) — por isso não
  // pertence a nenhum dos hooks de dados extraídos, cada um recebe como argumento.
  const [selectedBrand, setSelectedBrand] = useState<'atlasgr' | 'totaltrac'>(
    activeBrand === 'totaltrac' ? 'totaltrac' : 'atlasgr',
  );
  useEffect(() => {
    setSelectedBrand(activeBrand === 'totaltrac' ? 'totaltrac' : 'atlasgr');
  }, [activeBrand]);

  // Fase 4: Matriz de Qualificação/Objeções saíram do arquivo estático brandMatrices.ts pro
  // banco — busca uma vez aqui, os 3 hooks abaixo recebem os arrays já prontos em vez de
  // importar o arquivo estático cada um por conta própria.
  const { objections, qualifications } = usePlaybookMatrixData(selectedBrand);

  const {
    messages,
    inputQuery,
    setInputQuery,
    isSearching,
    searchMode,
    setSearchMode,
    handleSendMessage,
    activeRecord,
  } = useAssistantChat(activeBrand, brandInfo, selectedBrand, objections, qualifications);

  const {
    roleplayPersona,
    setRoleplayPersona,
    roleplayActive,
    setRoleplayActive,
    roleplayMessages,
    roleplayInput,
    setRoleplayInput,
    roleplayScore,
    roleplayFeedback,
    roleplayError,
    isRoleplayThinking,
    startRoleplay,
    handleRoleplaySubmit,
  } = useRoleplaySimulator(brandInfo, selectedBrand, objections);

  const {
    selectedSegment,
    setSelectedSegment,
    selectedPersona,
    setSelectedPersona,
    playbookView,
    setPlaybookView,
    copiedKey,
    handleCopy,
    filteredObjections,
    filteredQualifications,
  } = usePlaybookMatrixFilters(selectedBrand, objections, qualifications);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, roleplayMessages]);

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
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand to-brand-2 flex items-center justify-center text-white shadow-lg shadow-brand/20">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-extrabold text-base text-ink tracking-tight">
                      {brandInfo.name} Copilot
                    </h2>
                    {/* bg-emerald-500/20 text-emerald-300 cru (contra bg-surface, tema claro) dava
                        contraste ainda pior que o achado do axe-core em ChatbookHub.tsx (mesmo badge,
                        mesma superfície) — mesmo padrão de badge "soft" já usado em Badge.tsx
                        (variant="success"). */}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success-active dark:text-success font-bold border border-success/30">
                      Groq IA
                    </span>
                  </div>
                  <p className="text-xs text-ink-2">
                    Assistente comercial com base interna; sem navegação web
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                aria-label="Fechar assistente"
                className="p-2 text-ink-2 hover:text-ink hover:bg-surface-2 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selector de 3 Abas Principais */}
            <div className="flex border-b border-line bg-surface-2 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('assistant')}
                aria-pressed={activeTab === 'assistant'}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'assistant'
                    ? 'bg-brand-active text-white shadow-md font-extrabold'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                <Globe className="w-4 h-4" /> Assistente IA
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('roleplay')}
                aria-pressed={activeTab === 'roleplay'}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'roleplay'
                    ? 'bg-brand-active text-white shadow-md font-extrabold'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                <User className="w-4 h-4" /> Roleplay Simulator
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('playbook')}
                aria-pressed={activeTab === 'playbook'}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'playbook'
                    ? 'bg-brand-active text-white shadow-md font-extrabold'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                <Target className="w-4 h-4" /> Matrizes & Objeções
              </button>
            </div>

            {/* CONTEÚDO DA ABA 1: ASSISTENTE CONVERSACIONAL */}
            {activeTab === 'assistant' && (
              <div className="flex-1 flex flex-col min-h-0 bg-surface">
                {/* Mode Selector */}
                <div className="p-3 border-b border-line bg-surface-2 flex items-center justify-between gap-2 text-xs flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-ink-2 font-medium">Fonte única do copiloto:</span>
                    {/* Mesmo achado do Piloto 010 em ChatbookHub.tsx: o registro aberto já é
                        injetado em toda pergunta, mas só aparecia uma vez na saudação inicial. */}
                    {activeRecord && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-brand-active dark:text-brand-2 bg-brand/10 border border-brand/20 rounded-full px-2 py-0.5">
                        <Link2 className="w-3 h-3" /> {activeRecord.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 bg-surface-2 p-1 rounded-xl border border-line">
                    <button
                      type="button"
                      onClick={() => setSearchMode('general')}
                      aria-pressed={searchMode === 'general'}
                      className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        searchMode === 'general'
                          ? 'bg-brand-active text-white shadow-sm'
                          : 'text-ink-2 hover:text-ink'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" /> IA conversacional
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchMode('internal')}
                      aria-pressed={searchMode === 'internal'}
                      className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        searchMode === 'internal'
                          ? 'bg-brand-active text-white shadow-sm'
                          : 'text-ink-2 hover:text-ink'
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
                            ? 'bg-brand-active text-white rounded-br-none font-medium'
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
                    <div className="flex items-center gap-2 text-xs text-brand-active dark:text-brand-2 bg-surface-2 p-3 rounded-2xl border border-line w-fit animate-pulse">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Consultando o motor Groq...</span>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input Prompt Footer */}
                <form
                  onSubmit={handleSendMessage}
                  className="p-4 border-t border-line bg-surface flex items-center gap-2"
                >
                  <input
                    type="text"
                    placeholder={
                      searchMode === 'general'
                        ? 'Pergunte sobre a rota ou registro aberto...'
                        : `Consulte a matriz comercial da ${brandInfo.name}...`
                    }
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-surface-2 text-ink text-xs border border-line focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                  <Button
                    type="submit"
                    disabled={isSearching}
                    size="sm"
                    aria-label="Enviar mensagem"
                    className="px-4 py-2.5 bg-brand-active text-white font-bold cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            )}

            {/* CONTEÚDO DA ABA 2: ROLEPLAY SANDBOX (COMPRADOR B2B) */}
            {activeTab === 'roleplay' && (
              <div className="flex-1 flex flex-col min-h-0 bg-surface p-4 space-y-4 overflow-y-auto">
                {/* Esta aba é a prática rápida por texto — a simulação completa por voz, com nota final
                    detalhada, fica no módulo dedicado "Roleplay" (Sidebar → Inteligência). */}
                <button
                  onClick={() => {
                    navigate('/app/roleplay');
                    onClose();
                  }}
                  className="w-full p-3 rounded-2xl bg-surface-2 border border-line flex items-center justify-between gap-3 text-left hover:border-amber-500/40 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 text-xs text-amber-200">
                    <Mic className="w-5 h-5 text-amber-400 shrink-0" />
                    <span className="font-medium">
                      <strong className="text-amber-400 block mb-1">Aviso Importante:</strong>
                      Esta é apenas uma simulação em formato de chat (texto). Para o treinamento
                      imersivo por voz, abra o{' '}
                      <span className="font-bold underline">Roleplay Simulator</span>.
                    </span>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
                </button>
                <div className="p-4 rounded-2xl bg-surface-2 border border-line space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                      <User className="w-4 h-4 text-amber-400" /> Selecione a Persona do Comprador
                      B2B
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
                        roleplayPersona === 'skeptical_cfo'
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                          : 'bg-surface border-line text-ink-2 hover:text-ink'
                      }`}
                    >
                      CFO Cético (Foco ROI)
                    </button>
                    <button
                      onClick={() => setRoleplayPersona('strict_buyer')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        roleplayPersona === 'strict_buyer'
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                          : 'bg-surface border-line text-ink-2 hover:text-ink'
                      }`}
                    >
                      Comprador Rígido
                    </button>
                    <button
                      onClick={() => setRoleplayPersona('tech_director')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        roleplayPersona === 'tech_director'
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                          : 'bg-surface border-line text-ink-2 hover:text-ink'
                      }`}
                    >
                      Diretor de TI
                    </button>
                  </div>

                  {!roleplayActive ? (
                    <Button
                      onClick={startRoleplay}
                      className="w-full py-2.5 font-bold cursor-pointer"
                    >
                      <Play className="w-4 h-4 mr-2" /> Iniciar Treinamento de Roleplay
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setRoleplayActive(false)}
                      className="w-full py-2.5 font-bold text-red-400 border-red-500/30 hover:bg-red-500/10 cursor-pointer"
                    >
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
                        <span className="text-[10px] text-ink-2">
                          Clareza: {roleplayScore.clarity}% | Contorno de objeções:{' '}
                          {roleplayScore.objectionHandling}%
                        </span>
                        {roleplayFeedback && (
                          <span className="text-[10px] text-emerald-200 block mt-1">
                            {roleplayFeedback}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-lg font-black text-emerald-400">
                      {roleplayScore.total}% estimado
                    </span>
                  </div>
                )}

                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {roleplayMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col ${msg.sender === 'sdr' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`p-3.5 rounded-2xl text-xs max-w-[88%] leading-relaxed ${
                          msg.sender === 'sdr'
                            ? 'bg-indigo-600 text-white rounded-br-none font-medium'
                            : 'bg-surface-2 text-amber-200 border border-amber-500/20 rounded-bl-none'
                        }`}
                      >
                        <span className="font-bold text-[10px] block opacity-75 mb-1 uppercase">
                          {msg.sender === 'sdr'
                            ? 'Você (SDR)'
                            : `Comprador (${roleplayPersona.replace('_', ' ').toUpperCase()})`}
                        </span>
                        <p>{msg.text}</p>
                      </div>
                    </div>
                  ))}
                  {isRoleplayThinking && (
                    <div className="flex items-center gap-2 text-xs text-amber-300">
                      <RefreshCw className="w-4 h-4 animate-spin" />O comprador simulado está
                      analisando sua resposta...
                    </div>
                  )}
                  {roleplayError && (
                    <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-300">
                      Não foi possível continuar o roleplay: {roleplayError}
                    </div>
                  )}
                </div>

                {roleplayActive && (
                  <form
                    onSubmit={handleRoleplaySubmit}
                    className="flex items-center gap-2 pt-2 border-t border-line"
                  >
                    <input
                      type="text"
                      placeholder="Responda à pergunta do comprador..."
                      value={roleplayInput}
                      onChange={(e) => setRoleplayInput(e.target.value)}
                      disabled={isRoleplayThinking}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-surface-2 text-ink text-xs border border-line focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isRoleplayThinking}
                      className="px-4 py-2.5 bg-brand text-white font-bold cursor-pointer"
                    >
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
                      <Filter className="w-4 h-4 text-brand" /> Filtros Avançados de Playbook
                    </span>
                    <div className="flex items-center gap-1 bg-surface p-1 rounded-xl border border-line text-xs">
                      <button
                        onClick={() => setPlaybookView('objections')}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          playbookView === 'objections'
                            ? 'bg-brand-active text-white'
                            : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        Objeções
                      </button>
                      <button
                        onClick={() => setPlaybookView('qualifications')}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          playbookView === 'qualifications'
                            ? 'bg-brand-active text-white'
                            : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        Qualificação
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {/* Seletor de Marca */}
                    <div>
                      <label
                        htmlFor="chatbook-brand"
                        className="font-bold text-ink-2 block mb-1 text-[10px] uppercase"
                      >
                        Empresa / Marca
                      </label>
                      <select
                        id="chatbook-brand"
                        value={selectedBrand}
                        onChange={(e) =>
                          setSelectedBrand(e.target.value as 'atlasgr' | 'totaltrac')
                        }
                        className="w-full px-2.5 py-1.5 rounded-xl bg-surface text-ink font-bold border border-line focus:outline-none focus:ring-1 focus:ring-brand"
                      >
                        <option value="atlasgr">AtlasGR (SaaS B2B)</option>
                        <option value="totaltrac">Total Trac (Frotas/Risco)</option>
                      </select>
                    </div>

                    {/* Seletor de Segmento */}
                    <div>
                      <label
                        htmlFor="chatbook-segment"
                        className="font-bold text-ink-2 block mb-1 text-[10px] uppercase"
                      >
                        Segmento
                      </label>
                      <select
                        id="chatbook-segment"
                        value={selectedSegment}
                        onChange={(e) => setSelectedSegment(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-surface text-ink border border-line focus:outline-none focus:ring-1 focus:ring-brand"
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
                      <label
                        htmlFor="chatbook-persona"
                        className="font-bold text-ink-2 block mb-1 text-[10px] uppercase"
                      >
                        Persona Decisora
                      </label>
                      <select
                        id="chatbook-persona"
                        value={selectedPersona}
                        onChange={(e) => setSelectedPersona(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-surface text-ink border border-line focus:outline-none focus:ring-1 focus:ring-brand"
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
                        <AlertTriangle className="w-4 h-4 text-red-400" /> Objeções Mapeadas (
                        {filteredObjections.length})
                      </h4>
                      <span className="text-[10px] text-ink-2">
                        Marca: {selectedBrand.toUpperCase()}
                      </span>
                    </div>

                    {filteredObjections.length === 0 ? (
                      <div className="text-center py-8 text-xs text-ink-2 bg-surface-2 rounded-2xl border border-line">
                        Nenhuma objeção encontrada para os filtros selecionados.
                      </div>
                    ) : (
                      filteredObjections.map((item) => (
                        <div
                          key={item.id}
                          className="glass-card p-4 rounded-2xl border border-line space-y-3 bg-surface-2"
                        >
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
                              {copiedKey === item.id ? (
                                <Check className="w-3.5 h-3.5 text-green-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              {copiedKey === item.id ? 'Copiado' : 'Copiar Resposta'}
                            </button>
                          </div>

                          <div>
                            <h5 className="font-bold text-ink text-xs mb-1">
                              ❓ Objeção: &quot;{item.objectionTitle}&quot;
                            </h5>
                            <p className="text-ink-2 text-xs italic">
                              &quot;{item.objectionText}&quot;
                            </p>
                          </div>

                          <div className="p-3 rounded-xl bg-surface border border-line space-y-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block">
                              💬 Script de Contorno (Recomendado)
                            </span>
                            <p className="text-xs text-ink leading-relaxed font-medium">
                              {item.responseScript}
                            </p>
                          </div>

                          <p className="text-[11px] text-amber-400 font-bold">
                            💡 Diferencial Chave: {item.keyDifferentiator}
                          </p>
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
                        <Target className="w-4 h-4 text-brand" /> Matriz de Qualificação (
                        {filteredQualifications.length})
                      </h4>
                      <span className="text-[10px] text-ink-2">
                        Marca: {selectedBrand.toUpperCase()}
                      </span>
                    </div>

                    {filteredQualifications.length === 0 ? (
                      <div className="text-center py-8 text-xs text-ink-2 bg-surface-2 rounded-2xl border border-line">
                        Nenhuma pergunta de qualificação para os filtros selecionados.
                      </div>
                    ) : (
                      filteredQualifications.map((item) => (
                        <div
                          key={item.id}
                          className="glass-card p-4 rounded-2xl border border-line space-y-3 bg-surface-2"
                        >
                          <div className="flex items-center justify-between pb-2 border-b border-line">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] px-2 py-0.5 rounded bg-brand/20 text-brand-active dark:text-brand-2 font-bold border border-brand/30">
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
                              {copiedKey === item.id ? (
                                <Check className="w-3.5 h-3.5 text-green-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              {copiedKey === item.id ? 'Copiado' : 'Copiar Pergunta'}
                            </button>
                          </div>

                          <div>
                            <h5 className="font-bold text-ink text-xs mb-1">
                              ❓ Pergunta de Diagnóstico ({item.segment}):
                            </h5>
                            <p className="text-ink text-xs font-semibold">{item.questionText}</p>
                          </div>

                          <div className="p-3 rounded-xl bg-surface border border-line space-y-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-300 block">
                              🎯 Resposta Esperada / Sinal Amarelo
                            </span>
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
