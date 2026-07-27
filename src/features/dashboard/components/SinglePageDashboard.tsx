import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Truck, ArrowRight, ChevronLeft, Search, LayoutTemplate,
  Target, Building2, User, Activity, Bot, Sun, Moon, Save,
  Check, ChevronRight, SlidersHorizontal,
  Plus, BookOpen, Layers, Home,
  TerminalSquare, Workflow, MessagesSquare, Database, Cpu, FileBarChart, BrainCircuit
} from 'lucide-react';
import { useBrand } from '../../../contexts/BrandContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { ClockCalendarWidget } from '../../../components/ui/ClockCalendarWidget';
import { Logo } from '../../../components/Logo';
import { TotalTrackLogo } from '../../../components/TotalTrackLogo';
import { ProspectingHub } from '../../prospecting/components/ProspectingHub';
import { CrmBoard } from '../../../components/CrmBoard';
import { IntelligenceHub } from '../../intelligence/components/IntelligenceHub';
import { CompanyList } from '../../companies/components/CompanyList';
import { ContactList } from '../../contacts/components/ContactList';
import { ActivityList } from '../../activities/components/ActivityList';
import { ChatbookHub } from '../../chatbook/components/ChatbookHub';
import { AiToolBuilder } from '../../intelligence/components/AiToolBuilder';
import { TopicTrainingAcademy } from '../../intelligence/components/TopicTrainingAcademy';
import { BitrixGuideHub } from '../../intelligence/components/BitrixGuideHub';
import { ReportsHub } from '../../intelligence/components/ReportsHub';
import { SoundFX } from '../../../lib/soundEffects';
import { LiveStatsWidget } from '../../../components/ui/LiveStatsWidget';

type ScreenStep = 'home' | 'company_tools' | 'tool_active';
type ToolType =
  | 'prospect' | 'crm' | 'intelligence' | 'companies' | 'contacts' | 'activities' | 'roleplay'
  | 'ai_builder' | 'topic_training' | 'bitrix'
  | 'ia_superagent' | 'ia_scripts' | 'ia_automations' | 'ia_abordagem' | 'ia_generator' | 'ia_rag' | 'ai_config' | 'reports';

const TOOL_ORDER: ToolType[] = [
  'prospect', 'crm', 'intelligence', 'companies', 'contacts', 'activities', 'roleplay',
  'ai_builder', 'topic_training', 'bitrix',
  'ia_superagent', 'ia_scripts', 'ia_automations', 'ia_abordagem', 'ia_generator', 'ia_rag', 'ai_config', 'reports',
];

export function SinglePageDashboard() {
  const { activeBrand, setActiveBrand } = useBrand();
  const { currentUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [step, setStep] = useState<ScreenStep>('home');
  const [activeTool, setActiveTool] = useState<ToolType>('prospect');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  const handleSelectCompany = (brand: 'atlasgr' | 'totaltrac') => {
    SoundFX.playClick();
    setActiveBrand(brand);
    setStep('company_tools');
  };

  const handleOpenTool = (tool: ToolType) => {
    SoundFX.playClick();
    setActiveTool(tool);
    setStep('tool_active');
  };

  const handleCycleTool = (direction: 1 | -1) => {
    SoundFX.playClick();
    const currentIndex = TOOL_ORDER.indexOf(activeTool);
    const nextIndex = (currentIndex + direction + TOOL_ORDER.length) % TOOL_ORDER.length;
    setActiveTool(TOOL_ORDER[nextIndex]);
  };

  const handleSaveState = () => {
    SoundFX.playSuccess();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-transparent flex flex-col items-center relative min-h-screen font-sans p-4 md:p-8 space-y-8 text-gray-100">

      <div className="w-full max-w-7xl space-y-8">

        {/* ========================================================================= */}
        {/* TELA 1: HOME (RELÓGIO/CALENDÁRIO + OS 2 CARDS DE ENTRADA) */}
        {/* ========================================================================= */}
        {step === 'home' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {/* Topbar Minimalista da Tela 1 com Botão Salvar e Som Hátil */}
            <div className="w-full flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                {activeBrand === 'atlasgr' ? (
                  <Logo className="h-9 text-white" />
                ) : (
                  <TotalTrackLogo className="h-9 text-white" />
                )}
              </div>

              <div className="flex items-center gap-3">
                {/* Botão Salvar Preferências */}
                <button
                  onClick={handleSaveState}
                  className={`px-4 py-2 rounded-2xl font-extrabold text-xs transition-all flex items-center gap-2 shadow-lg cursor-pointer ${
                    isSaved
                      ? 'bg-success text-slate-950 shadow-success/30'
                      : 'bg-gradient-to-r from-atlas-orange to-orange-400 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_20px_-6px_rgba(255,86,24,0.55)] hover:brightness-110 hover:scale-105 active:scale-95'
                  }`}
                >
                  {isSaved ? <Check className="w-4 h-4 animate-bounce" /> : <Save className="w-4 h-4" />}
                  <span>{isSaved ? 'Salvo com Sucesso!' : 'Salvar Alterações'}</span>
                </button>

                {/* Botão Alternar Modo Claro / Escuro */}
                <button
                  onClick={() => { SoundFX.playClick(); toggleTheme(); }}
                  className="p-2.5 rounded-2xl bg-white/10 border border-white/10 hover:border-atlas-orange transition-all cursor-pointer text-atlas-yellow shadow-md backdrop-blur-2xl hover:scale-105"
                  title="Mudar Tema"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4 text-atlas-yellow" /> : <Moon className="w-4 h-4 text-white/70" />}
                </button>

                {/* Badge de Usuário Conectado */}
                <div className="hidden sm:flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white/10 border border-white/10 shadow-md backdrop-blur-2xl text-xs font-bold">
                  <div className={`w-6 h-6 rounded-xl ${currentUser?.avatarBg || 'bg-atlas-orange'} text-white text-[10px] flex items-center justify-center font-black shadow-sm`}>
                    {currentUser?.name.charAt(0) || 'M'}
                  </div>
                  <span className="text-white font-extrabold">{currentUser?.name}</span>
                </div>
              </div>
            </div>

            {/* 1. RELÓGIO OPERACIONAL & CALENDÁRIO INTERATIVO */}
            <ClockCalendarWidget />

            {/* 1.5 WIDGET DE ESTATÍSTICAS LIVE DO BANCO DE DADOS */}
            <LiveStatsWidget />

            {/* 2. OS 2 CARDS PRINCIPAIS DE ENTRADA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

              {/* CARD 1: ATLASGR */}
              <motion.div
                whileHover={{ scale: 1.025, y: -8 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelectCompany('atlasgr')}
                className="p-10 md:p-12 rounded-[3.5rem] border transition-all duration-500 cursor-pointer flex flex-col items-center justify-between text-center min-h-[480px] relative overflow-hidden bg-white shadow-[0_25px_70px_rgba(255,86,24,0.18)] hover:shadow-[0_35px_90px_rgba(255,86,24,0.35)] border-atlas-orange/15 hover:border-atlas-orange/60 group"
              >
                <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-atlas-orange to-orange-300" />
                <div className="absolute top-0 right-0 w-80 h-80 bg-atlas-orange/10 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700" />

                <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center space-y-6">
                  <div className="flex items-center justify-center">
                    <Logo className="h-16 md:h-18 text-slate-900 drop-shadow-sm" />
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-widest text-atlas-orange bg-atlas-orange/10 px-4 py-1.5 rounded-full border border-atlas-orange/25 shadow-2xs">
                    Segurança e Inteligência Logística
                  </span>
                  <p className="text-xs text-slate-600 max-w-sm leading-relaxed font-semibold">
                    Prospecção autônoma de leads, enriquecimento de e-mails via SMTP live, metodologias B2B (SPIN/SNAP/MEDDPICC) e CRM Kanban.
                  </p>
                </div>

                <div className="w-full relative z-10 pt-6">
                  <div className="w-full bg-gradient-to-r from-atlas-orange via-orange-500 to-orange-400 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-3 uppercase tracking-wider text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_12px_35px_rgba(255,86,24,0.6)] group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_18px_50px_rgba(255,86,24,0.8)] group-hover:scale-[1.02] transition-all">
                    <span>Acessar Operação AtlasGR</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </motion.div>

              {/* CARD 2: TOTALTRAC */}
              <motion.div
                whileHover={{ scale: 1.025, y: -8 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelectCompany('totaltrac')}
                className="p-10 md:p-12 rounded-[3.5rem] border transition-all duration-500 cursor-pointer flex flex-col items-center justify-between text-center min-h-[480px] relative overflow-hidden bg-white shadow-[0_25px_70px_rgba(0,136,204,0.18)] hover:shadow-[0_35px_90px_rgba(0,136,204,0.35)] border-totaltrack-blue/15 hover:border-totaltrack-blue/60 group"
              >
                <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-totaltrack-blue to-sky-300" />
                <div className="absolute top-0 right-0 w-80 h-80 bg-totaltrack-blue/10 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700" />

                <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center space-y-6">
                  <div className="flex items-center justify-center">
                    <TotalTrackLogo className="h-16 md:h-18 text-slate-900 drop-shadow-sm" />
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-widest text-totaltrack-blue bg-totaltrack-blue/10 px-4 py-1.5 rounded-full border border-totaltrack-blue/25 shadow-2xs">
                    Controle Total do que Importa para Você
                  </span>
                  <p className="text-xs text-slate-600 max-w-sm leading-relaxed font-semibold">
                    KM Inteligente com rastreamento e telemetria, Central de Monitoramento e Central de Sinistros 24h, rastreamento com seguro e rede autorizada em todo o Brasil.
                  </p>
                </div>

                <div className="w-full relative z-10 pt-6">
                  <div className="w-full bg-gradient-to-r from-totaltrack-blue via-sky-500 to-blue-600 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-3 uppercase tracking-wider text-xs shadow-xl shadow-totaltrack-blue/40 group-hover:scale-[1.02] transition-all">
                    <span>Acessar Operação TotalTrac</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </motion.div>

            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TELA 2: PORTAL DA EMPRESA SELECIONADA (GRID COM AS 10 FERRAMENTAS INDIVIDUAIS) */}
        {/* ========================================================================= */}
        {step === 'company_tools' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-8"
          >
            {/* Topbar com Botão Voltar para o Início */}
            <div className="flex items-center justify-between p-4 rounded-[2rem] bg-slate-900/60 backdrop-blur-2xl border border-white/10 shadow-xl">
              <button
                onClick={() => { SoundFX.playClick(); setStep('home'); }}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-slate-900 font-extrabold text-xs hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-lg"
              >
                <ChevronLeft className="w-4 h-4 text-atlas-orange" /> ◀️ Voltar para o Início (Relógio & Cards)
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveState}
                  className={`px-4 py-2 rounded-2xl font-extrabold text-xs transition-all flex items-center gap-2 shadow-lg cursor-pointer ${
                    isSaved ? 'bg-success text-slate-950' : 'bg-atlas-orange text-white hover:scale-105'
                  }`}
                >
                  <Save className="w-4 h-4" /> {isSaved ? 'Salvo!' : 'Salvar Preferências'}
                </button>

                <span className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider ${
                  activeBrand === 'atlasgr'
                    ? 'bg-gradient-to-r from-atlas-orange to-orange-400 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]'
                    : 'bg-gradient-to-r from-totaltrack-blue to-blue-600 text-white shadow-md'
                }`}>
                  {activeBrand === 'atlasgr' ? 'OPERAÇÃO ATLASGR' : 'OPERAÇÃO TOTALTRAC'}
                </span>
              </div>
            </div>

            {/* Cabeçalho da Empresa com Gradiente Oficial (Laranja para AtlasGR / Azul para TotalTrac) */}
            <div className={`p-8 md:p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 border border-white/20 ${
              activeBrand === 'atlasgr'
                ? 'bg-gradient-to-r from-[#FF8008] via-[#FF5618] to-[#FF6B10]'
                : 'bg-gradient-to-r from-[#00A8FF] via-[#0088CC] to-[#005599]'
            }`}>
              <div className="flex items-center gap-5">
                <div className="w-18 h-18 rounded-[1.5rem] bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white shadow-lg shrink-0">
                  {activeBrand === 'atlasgr' ? <Shield className="w-9 h-9" /> : <Truck className="w-9 h-9" />}
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight">{activeBrand === 'atlasgr' ? 'Atlas — Segurança e Inteligência Logística' : 'TotalTrac — Controle Total do que Importa para Você'}</h2>
                  <p className="text-xs text-white/90 mt-1 font-semibold">Escolha abaixo a ferramenta que deseja executar para esta empresa:</p>
                </div>
              </div>
              <span className="px-4 py-2 rounded-xl bg-white/20 backdrop-blur-md text-xs font-black uppercase tracking-widest border border-white/30">
                18 Ferramentas Liberadas
              </span>
            </div>

            {/* MOTOR DE BUSCA INTERATIVO DE FERRAMENTAS */}
            <div className="bg-slate-900/60 backdrop-blur-2xl p-4 rounded-3xl border border-white/10 shadow-lg flex flex-col sm:flex-row items-center gap-4">
              <div className="relative flex-1 w-full">
                <Search className="w-5 h-5 text-gray-500 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar ferramentas por nome (ex: Criar IA, Treinamento, Bitrix, Prospecção, SPIN, Objeções...)"
                  className="w-full bg-slate-950/60 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-xs text-gray-100 font-semibold focus:outline-none focus:ring-2 focus:ring-atlas-orange transition-all placeholder-gray-500"
                />
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-gray-400 shrink-0">
                <SlidersHorizontal className="w-4 h-4 text-atlas-orange" />
                <span>18 Módulos Disponíveis</span>
              </div>
            </div>

            {/* GRID DE CARDS SEPARADOS PARA CADA FERRAMENTA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

              {/* CARD 1: PROSPECÇÃO IA */}
              <AppleToolCard
                title={activeBrand === 'atlasgr' ? "Atlas Radar: Prospecção de Transportadoras" : "TotalTrac Radar: Localização de Frotas"}
                desc={activeBrand === 'atlasgr'
                  ? "Mapeamento comercial inteligente focado em identificar transportadoras e frotistas ideais para as soluções Profile e GR."
                  : "Mapeamento de frotistas e transportadoras de grande escala ideais para o sistema de Telemetria e Trava Remota."}
                icon={<Search className="w-8 h-8 text-atlas-orange" />}
                badge="Prospecção IA"
                onClick={() => handleOpenTool('prospect')}
                visible={!searchQuery || 'prospeccao busca ia cnpj sdr radar leads frotistas mapeamento localizador'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 2: CRM PIPELINE KANBAN */}
              <AppleToolCard
                title={activeBrand === 'atlasgr' ? "Atlas CRM: Funil de Vendas Profile & GR" : "TotalTrac CRM: Funil de Rastreamento & M2M"}
                desc={activeBrand === 'atlasgr'
                  ? "Quadro Kanban de negociações comerciais especializado em pacotes integrados de Gerenciamento de Risco (GR) e Atlas Profile."
                  : "Funil de vendas para rastreadores veiculares, mensalidades de chips M2M multi-operadora e ativação de travas."}
                icon={<LayoutTemplate className="w-8 h-8 text-info" />}
                badge="Funil Comercial"
                onClick={() => handleOpenTool('crm')}
                visible={!searchQuery || 'crm pipeline kanban funil vendas contratos logistica profile gr connect m2m'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 3: ESTÚDIO DE METODOLOGIAS */}
              <AppleToolCard
                title={activeBrand === 'atlasgr' ? "Atlas Playbook: Abordagem Profile & GR" : "TotalTrac Playbook: Abordagem de Frota"}
                desc={activeBrand === 'atlasgr'
                  ? "Perguntas de SPIN, SNAP e Challenger Sales com foco em prevenção de sinistros e homologação com seguradoras."
                  : "Roteiros para apresentar redução imediata no consumo de diesel, manutenção preditiva e segurança da carga."}
                icon={<Target className="w-8 h-8 text-atlas-yellow" />}
                badge="Metodologia de Vendas"
                onClick={() => handleOpenTool('intelligence')}
                visible={!searchQuery || 'spin snap aida meddpicc challenger metodologias scripting vendas telemetria profile gr'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 4: TECH STACK / SOFTWARE LOGÍSTICO */}
              <AppleToolCard
                title={activeBrand === 'atlasgr' ? "Atlas Tech Stack: Software Logístico & Rastreamento" : "TotalTrac Tech Stack: Dispositivos & Concorrência"}
                desc={activeBrand === 'atlasgr'
                  ? "Mapeamento tecnográfico dos sistemas de Software Logístico, ERP e rastreadores (Omnilink, Sascar, Autotrac) usados pelo prospect."
                  : "Mapeamento de hardwares de telemetria instalados e contratos de chips multi-operadora da concorrência."}
                icon={<Building2 className="w-8 h-8 text-sky-400" />}
                badge="Tech Stack"
                onClick={() => handleOpenTool('companies')}
                visible={!searchQuery || 'empresas stack software cnpj tecnologia hardware rastreamento tms devices logistico'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 5: CONTATOS & DECISORES C-LEVEL */}
              <AppleToolCard
                title={activeBrand === 'atlasgr' ? "Atlas Decisores: Diretoria de Gerenciamento de Risco" : "TotalTrac Decisores: Gestão de Frota"}
                desc={activeBrand === 'atlasgr'
                  ? "Diretório de Gerentes de Transportes, CFOs e Gerentes de Gerenciamento de Risco (GR) responsáveis pela homologação e contratação."
                  : "Contatos de Diretores de Operações, Gerentes de Logística e donos de frotas com e-mails validados."}
                icon={<User className="w-8 h-8 text-success" />}
                badge="Diretório de Decisores"
                onClick={() => handleOpenTool('contacts')}
                visible={!searchQuery || 'contatos decisores c-level cargos diretores gestores frota logistica gr'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 6: AGENDA / TORRE DE CONTROLE */}
              <AppleToolCard
                title={activeBrand === 'atlasgr' ? "Atlas Torre de Controle: Agenda & Homologações" : "TotalTrac Agenda: Testes & Instalações"}
                desc={activeBrand === 'atlasgr'
                  ? "Compromissos comerciais, reuniões de fechamento de planos Atlas Profile/GR e análises de risco logístico, no espírito da Torre de Controle Atlas."
                  : "Agendamento de homologações em campo, instalações físicas de rastreadores e testes piloto em veículos."}
                icon={<Activity className="w-8 h-8 text-danger" />}
                badge="Agenda Comercial"
                onClick={() => handleOpenTool('activities')}
                visible={!searchQuery || 'agenda atividades reunioes tarefas follow-ups homologacoes teste piloto torre de controle'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 7: SAFETY / SIMULADOR DE OBJEÇÕES */}
              <AppleToolCard
                title={activeBrand === 'atlasgr' ? "Atlas Safety: Simulador de Objeções de Risco" : "TotalTrac Simulador: Objeções de Frota"}
                desc={activeBrand === 'atlasgr'
                  ? "Roleplay de inteligência artificial simulando objeções sobre Safety, custo de seguro e Gerenciamento de Risco."
                  : "Roleplay focado em quebrar objeções de frotistas sobre mensalidades, chips offline e trava remota."}
                icon={<Bot className="w-8 h-8 text-atlas-orange" />}
                badge="Simulador de Vendas"
                onClick={() => handleOpenTool('roleplay')}
                visible={!searchQuery || 'roleplay objecoes qualificacao simulador chat pitch gr frotas sinistro m2m safety'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 8: STUDIO DE CRIAÇÃO DE FERRAMENTAS IA */}
              <AppleToolCard
                title={activeBrand === 'atlasgr' ? "Atlas Studio: Copilotos de Gerenciamento de Risco" : "TotalTrac Studio: Copilotos de Gestão de Frota"}
                desc={activeBrand === 'atlasgr'
                  ? "Criador de ferramentas customizadas para análises de rotas, planos de viagem e propostas comerciais de Gerenciamento de Risco."
                  : "Estúdio de prompts de IA focado em relatórios de economia, redução de quebras e telemetria preditiva."}
                icon={<Plus className="w-8 h-8 text-orange-400" />}
                badge="Studio de IA"
                onClick={() => handleOpenTool('ai_builder')}
                highlight={true}
                visible={!searchQuery || 'criar ferramentas ia prompts studio gerador copilotos telemetria gr seguros'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 9: ACADEMIA DE TREINAMENTO POR TEMA */}
              <AppleToolCard
                title={activeBrand === 'atlasgr' ? "Atlas Academia: Formação em Profile & GR" : "TotalTrac Academia: Formação em Telemetria"}
                desc={activeBrand === 'atlasgr'
                  ? "Capacitação comercial sob demanda em técnicas de abordagem para as soluções Atlas Profile e Gerenciamento de Risco."
                  : "Cursos rápidos gerados por IA ensinando a vender redução de diesel, telemetria e trava autônoma."}
                icon={<BookOpen className="w-8 h-8 text-atlas-yellow" />}
                badge="Academia de IA"
                onClick={() => handleOpenTool('topic_training')}
                highlight={true}
                visible={!searchQuery || 'treinamento tema curso aula capacitacao academia atlas totaltrac profile gr telemetria'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 10: BITRIX24 HUB & BOAS PRÁTICAS */}
              <AppleToolCard
                title={activeBrand === 'atlasgr' ? "Atlas + Bitrix24: Contratos de Gerenciamento de Risco" : "TotalTrac + Bitrix24: Chips & Aparelhos"}
                desc={activeBrand === 'atlasgr'
                  ? "Fluxo oficial de cadastro de transportadoras, CNPJ e histórico de apólices de Gerenciamento de Risco integrados ao Bitrix24."
                  : "Passo a passo de sincronização de contratos de rastreadores ativos, chips M2M e ativação de contas no Bitrix24."}
                icon={<Layers className="w-8 h-8 text-sky-400" />}
                badge="Bitrix24 Hub"
                onClick={() => handleOpenTool('bitrix')}
                highlight={true}
                visible={!searchQuery || 'bitrix bitrix24 crm boas praticas tutoriais crm'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 11: FÁBRICA DE SUPERAGENTES IA */}
              <AppleToolCard
                title={activeBrand === 'atlasgr' ? "Atlas Copilotos: Agentes Autônomos de GR & Profile" : "TotalTrac Copilotos: Agentes de Telemetria"}
                desc="Orquestre agentes autônomos de IA: escolha provedor, modelo, temperatura, memória RAG e capabilities para cada etapa do funil."
                icon={<Bot className="w-8 h-8 text-info" />}
                badge="Fábrica de Agentes"
                onClick={() => handleOpenTool('ia_superagent')}
                visible={!searchQuery || 'superagentes ia agentes autonomos rag capabilities copilotos'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 12: CENTRAL DE SCRIPTS TÉCNICOS */}
              <AppleToolCard
                title="Central de Scripts: Integrações de Software Logístico"
                desc="Gere scripts robustos em Python, PowerShell, System Prompts e TypeScript para integrar CRM, ERP e sistemas de rastreamento."
                icon={<TerminalSquare className="w-8 h-8 text-atlas-orange" />}
                badge="Scripts Técnicos"
                onClick={() => handleOpenTool('ia_scripts')}
                visible={!searchQuery || 'scripts prompts python powershell typescript integracao gerador software logistico'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 13: AUTOMAÇÃO DE FLUXOS */}
              <AppleToolCard
                title={activeBrand === 'atlasgr' ? "Atlas Automação: Fluxos de Ocorrência & GR" : "TotalTrac Automação: Fluxos de Frota & M2M"}
                desc="Projete fluxos entre Webhooks, CRM, n8n, Make e Python. Receba o blueprint e o schema JSON pronto para implantar."
                icon={<Workflow className="w-8 h-8 text-atlas-yellow" />}
                badge="Automação de Processos"
                onClick={() => handleOpenTool('ia_automations')}
                visible={!searchQuery || 'automacoes webhooks n8n make blueprint fluxos json'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 14: OUTREACH / SUITE DE ABORDAGEM */}
              <AppleToolCard
                title={activeBrand === 'atlasgr' ? "Atlas Outreach: Ligações & E-mails de GR" : "TotalTrac Outreach: Ligações & E-mails de Frota"}
                desc="Crie scripts de ligação, e-mails hiper-personalizados e táticas de abordagem focadas em dados reais do lead."
                icon={<MessagesSquare className="w-8 h-8 text-success" />}
                badge="Geração de Abordagem"
                onClick={() => handleOpenTool('ia_abordagem')}
                visible={!searchQuery || 'abordagem ligacoes emails scripts personalizados tatica outreach'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 15: SIMULADOR COGNITIVO DE COMPRADOR */}
              <AppleToolCard
                title={activeBrand === 'atlasgr' ? "Atlas Simulador Cognitivo: Comprador de Risco" : "TotalTrac Simulador Cognitivo: Comprador de Frota"}
                desc="Simule compradores complexos, formule matrizes de dor e preveja objeções específicas do setor de risco logístico."
                icon={<BrainCircuit className="w-8 h-8 text-danger" />}
                badge="Simulação Cognitiva"
                onClick={() => handleOpenTool('ia_generator')}
                visible={!searchQuery || 'cognitivo comprador matriz dor objecoes simulador b2b'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 16: MEMÓRIA VETORIAL (RAG) */}
              <AppleToolCard
                title="Memória Atlas: Base de Conhecimento (RAG)"
                desc="Gerencie a base de conhecimento (Embeddings). Injeção de playbooks, apólices e dados estruturados para a IA."
                icon={<Database className="w-8 h-8 text-info" />}
                badge="Memória Vetorial"
                onClick={() => handleOpenTool('ia_rag')}
                visible={!searchQuery || 'rag embeddings vetorial base conhecimento playbooks memoria'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 17: CENTRAL DE MOTORES DE IA */}
              <AppleToolCard
                title="Central de Motores de IA: Gemini, GPT-4o & Claude"
                desc="Escolha o provedor/modelo (Gemini, GPT-4o, Claude) e a temperatura usados por cada ferramenta de geração de conteúdo."
                icon={<Cpu className="w-8 h-8 text-atlas-orange" />}
                badge="Motores de IA"
                onClick={() => handleOpenTool('ai_config')}
                highlight={true}
                visible={!searchQuery || 'motores ia gemini gpt claude provedor modelo configuracao'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

              {/* CARD 18: RELATÓRIOS: GERAÇÃO & INTERPRETAÇÃO POR IA */}
              <AppleToolCard
                title="Relatórios: Geração & Interpretação por IA"
                desc="A IA lê os números reais da plataforma (pipeline, leads, conversão) e escreve uma leitura executiva com recomendações."
                icon={<FileBarChart className="w-8 h-8 text-atlas-yellow" />}
                badge="Relatórios IA"
                onClick={() => handleOpenTool('reports')}
                highlight={true}
                visible={!searchQuery || 'relatorios reports interpretacao dados metricas executivo'.includes(searchQuery.toLowerCase())}
                brand={activeBrand}
              />

            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TELA 3: FERRAMENTA EM EXECUÇÃO (COM BOTÃO VOLTAR E BOTÃO SALVAR) */}
        {/* ========================================================================= */}
        {step === 'tool_active' && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            {/* Topbar de Navegação com Botão Voltar e Botão Salvar */}
            <div className="flex flex-wrap items-center justify-between p-4 rounded-3xl bg-slate-900/70 border border-white/10 shadow-xl backdrop-blur-2xl gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCycleTool(-1)}
                  title="Ferramenta Anterior"
                  aria-label="Ferramenta Anterior"
                  className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white text-slate-900 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-lg"
                >
                  <ChevronLeft className="w-5 h-5 text-atlas-orange" />
                </button>

                <button
                  onClick={() => handleCycleTool(1)}
                  title="Próxima Ferramenta"
                  aria-label="Próxima Ferramenta"
                  className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white text-slate-900 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-lg"
                >
                  <ChevronRight className="w-5 h-5 text-atlas-orange" />
                </button>

                <button
                  onClick={() => { SoundFX.playClick(); setStep('home'); }}
                  title="Início (Relógio & Cards)"
                  aria-label="Início (Relógio & Cards)"
                  className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/10 text-gray-200 hover:bg-white/15 transition-all cursor-pointer border border-white/10"
                >
                  <Home className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveState}
                  className={`px-4 py-2 rounded-2xl font-extrabold text-xs transition-all flex items-center gap-2 shadow-lg cursor-pointer ${
                    isSaved ? 'bg-success text-slate-950' : 'bg-gradient-to-r from-atlas-orange to-orange-400 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] hover:brightness-110 hover:scale-105'
                  }`}
                >
                  <Save className="w-4 h-4" /> {isSaved ? 'Dados Salvos!' : 'Salvar Dados'}
                </button>

                <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
                  activeBrand === 'atlasgr' ? 'bg-atlas-orange/15 text-atlas-orange border border-atlas-orange/30' : 'bg-totaltrack-blue/15 text-totaltrack-blue border border-totaltrack-blue/30'
                }`}>
                  {activeTool.toUpperCase()} ({activeBrand.toUpperCase()})
                </span>
              </div>
            </div>

            {/* Módulo Ativo Executando */}
            {activeTool === 'prospect' && <ProspectingHub />}
            {activeTool === 'crm' && <CrmBoard />}
            {activeTool === 'intelligence' && <IntelligenceHub />}
            {activeTool === 'companies' && <CompanyList />}
            {activeTool === 'contacts' && <ContactList />}
            {activeTool === 'activities' && <ActivityList />}
            {activeTool === 'roleplay' && <ChatbookHub />}
            {activeTool === 'ai_builder' && <AiToolBuilder />}
            {activeTool === 'topic_training' && <TopicTrainingAcademy />}
            {activeTool === 'bitrix' && <BitrixGuideHub />}
            {activeTool === 'ia_superagent' && <IntelligenceHub initialTab="superagent" />}
            {activeTool === 'ia_scripts' && <IntelligenceHub initialTab="scripts" />}
            {activeTool === 'ia_automations' && <IntelligenceHub initialTab="automations" />}
            {activeTool === 'ia_abordagem' && <IntelligenceHub initialTab="tools" />}
            {activeTool === 'ia_generator' && <IntelligenceHub initialTab="generator" />}
            {activeTool === 'ia_rag' && <IntelligenceHub initialTab="rag" />}
            {activeTool === 'ai_config' && <IntelligenceHub initialTab="ai_config" />}
            {activeTool === 'reports' && <ReportsHub />}

          </motion.div>
        )}

      </div>
    </div>
  );
}

// Componente Reutilizável de Card de Ferramenta (fundo branco + cor da marca: laranja Atlas / azul TotalTrac)
function AppleToolCard({ title, desc, icon, badge, onClick, highlight, visible, brand }: { title: string; desc: string; icon: React.ReactNode; badge: string; onClick: () => void; highlight?: boolean; visible: boolean; brand: string }) {
  if (!visible) return null;

  const isAtlas = brand === 'atlasgr';

  const gradientBgClass = isAtlas
    ? 'bg-white text-slate-900 shadow-[0_15px_40px_rgba(255,86,24,0.12)] hover:shadow-[0_25px_60px_rgba(255,86,24,0.28)] border-[#FF5618]/15'
    : 'bg-white text-slate-900 shadow-[0_15px_40px_rgba(0,136,204,0.12)] hover:shadow-[0_25px_60px_rgba(0,136,204,0.28)] border-[#0088CC]/15';

  const iconBgClass = isAtlas
    ? 'bg-[#FF5618]/10 border border-[#FF5618]/25 text-[#FF5618] [&_svg]:text-[#FF5618]'
    : 'bg-[#0088CC]/10 border border-[#0088CC]/25 text-[#0088CC] [&_svg]:text-[#0088CC]';

  const badgeClass = isAtlas
    ? 'bg-[#FF5618]/10 text-[#FF5618] border border-[#FF5618]/20'
    : 'bg-[#0088CC]/10 text-[#0088CC] border border-[#0088CC]/20';

  const bottomLinkClass = isAtlas
    ? 'text-[#FF5618] hover:text-orange-500'
    : 'text-[#0088CC] hover:text-sky-600';

  const borderClass = highlight
    ? (isAtlas ? 'border-orange-400/60 ring-4 ring-orange-500/10' : 'border-blue-400/60 ring-4 ring-blue-500/10')
    : (isAtlas ? 'hover:border-[#FF5618]/50' : 'hover:border-[#0088CC]/50');

  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -6 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`p-8 rounded-[2.8rem] border transition-all duration-300 cursor-pointer flex flex-col justify-between space-y-4 ${gradientBgClass} ${borderClass}`}
    >
      <div className="flex items-center justify-between">
        <div className={`p-4 rounded-2xl shadow-xs shrink-0 [&_svg]:w-8 [&_svg]:h-8 ${iconBgClass}`}>
          {icon}
        </div>
        <span className={`text-[10px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full ${badgeClass}`}>
          {badge}
        </span>
      </div>

      <div>
        <h3 className="text-lg font-black tracking-tight text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed font-semibold">{desc}</p>
      </div>

      <div className={`pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black transition-colors ${bottomLinkClass}`}>
        <span>Abrir Ferramenta</span>
        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </div>
    </motion.div>
  );
}
