import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    Database, Zap, Target, Bot, GraduationCap, Settings, Sparkles,
    FileText, Workflow, CheckSquare, Wand2, Search, ArrowLeft, ArrowRight,
} from 'lucide-react';
import { AIPendingActions } from './AIPendingActions';
import { B2BGenerator } from './B2BGenerator';
import { Intelligence } from '../../../components/Intelligence';
import { SuperagentCreator } from './SuperagentCreator';
import { RobustScriptGenerator } from './RobustScriptGenerator';
import { AutomationGuide } from './AutomationGuide';
import { SalesMethodologyStudio } from './SalesMethodologyStudio';
import { AIConfigCenter } from '../../dashboard/components/AIConfigCenter';
import { Card, CardTitle, CardDescription } from '../../../components/ui/Card';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { fadeInUp, staggerContainer, staggerItem, SPRING_SOFT } from '../../../lib/motion';

import { SwarmDashboard } from './SwarmDashboard';

export type IntelligenceTab = 'swarm' | 'methodologies' | 'ai_config' | 'superagent' | 'scripts' | 'automations' | 'actions' | 'generator' | 'tools' | 'rag';

interface IntelligenceHubProps {
    initialTab?: IntelligenceTab;
}

// O Hub de IA sempre abre na grade de ferramentas (nunca direto numa ferramenta padrão) — o
// usuário escolhe qual IA quer usar a partir dos cards, depois volta pra grade pelo botão "Voltar".
// `initialTab` continua existindo só para um eventual deep-link futuro; hoje nenhum chamador o passa.
const TOOL_TABS: { id: IntelligenceTab; label: string; icon: typeof Bot; description: string }[] = [
    { id: 'swarm', label: 'Enxame Autônomo', icon: Bot, description: 'Dispara uma missão para o enxame de agentes de IA (SDR, closer, CRM) e acompanha em tempo real.' },
    { id: 'methodologies', label: 'Metodologias de Vendas', icon: GraduationCap, description: 'Gera scripts B2B com frameworks clássicos: SPIN, SNAP, AIDA, MEDDPICC e Challenger.' },
    { id: 'ai_config', label: 'Central de Motores de IA', icon: Settings, description: 'Escolhe o modelo de IA e a temperatura usados por cada ferramenta de conteúdo do sistema.' },
    { id: 'superagent', label: 'Criador de Superagente', icon: Sparkles, description: 'Monta a configuração de um agente autônomo e gera prompt, JSON e scripts de provisionamento.' },
    { id: 'scripts', label: 'Gerador de Scripts', icon: FileText, description: 'Gera código pronto para produção — scraping, ETL, integrações de API e agentes SDR.' },
    { id: 'automations', label: 'Guia de Automações', icon: Workflow, description: 'Monta o guia, o workflow n8n e o script para ligar um gatilho a uma ação.' },
    { id: 'actions', label: 'Central de Decisões', icon: CheckSquare, description: 'Aprova ou descarta as ações que a IA recomendou, com risco e confiança.' },
    { id: 'generator', label: 'Gerador B2B', icon: Wand2, description: 'Simula dores, perguntas de qualificação e objeções táticas a partir do ICP e da solução.' },
    { id: 'tools', label: 'Outreach Intelligence', icon: Search, description: 'Gera scripts de ligação, WhatsApp, e-mail, cadência e battlecards para o lead selecionado.' },
    { id: 'rag', label: 'Conhecimento Vetorial (RAG)', icon: Database, description: 'Base de embeddings que o Agente SDR consulta para gerar abordagens contextuais.' },
];

export function IntelligenceHub({ initialTab }: IntelligenceHubProps) {
    const [activeTab, setActiveTab] = useState<IntelligenceTab | null>(initialTab ?? null);
    const accent = useBrandAccent();

    if (activeTab === null) {
        return (
            <div className="space-y-6">
                <header>
                    <h1 className="font-display text-2xl font-bold text-ink tracking-tight">Hub de IA</h1>
                    <p className="text-sm text-ink-2 mt-1">Escolha a ferramenta de IA que você quer usar.</p>
                </header>

                <motion.nav
                    aria-label="Ferramentas do Hub de IA"
                    variants={staggerContainer()}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                    {TOOL_TABS.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <motion.button
                                key={tab.id}
                                type="button"
                                variants={staggerItem}
                                whileHover={{ y: -4 }}
                                whileTap={{ scale: 0.97 }}
                                transition={SPRING_SOFT}
                                onClick={() => setActiveTab(tab.id)}
                                className="text-left cursor-pointer group"
                            >
                                <Card
                                    variant="default"
                                    padding="lg"
                                    className={`h-full transition-all duration-300 ${accent.hoverBorder} group-hover:bg-surface-2 group-focus-visible:bg-surface-2 group-hover:shadow-lg group-focus-visible:shadow-lg`}
                                >
                                    <div className={`w-11 h-11 rounded-2xl ${accent.bgSoft} flex items-center justify-center ${accent.text} shrink-0 mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-focus-visible:scale-110`}>
                                        <Icon size={20} />
                                    </div>
                                    <CardTitle className={accent.text}>{tab.label}</CardTitle>
                                    <CardDescription className="mt-1.5">{tab.description}</CardDescription>
                                    <span className={`mt-4 inline-flex items-center gap-1 text-xs font-bold ${accent.text} opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-all duration-300 group-hover:translate-x-0.5`}>
                                        Abrir <ArrowRight className="w-3.5 h-3.5" />
                                    </span>
                                </Card>
                            </motion.button>
                        );
                    })}
                </motion.nav>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <button
                type="button"
                onClick={() => setActiveTab(null)}
                className="flex items-center gap-2 text-ink-2 hover:text-ink transition-colors group cursor-pointer"
            >
                <div className="p-2 rounded-xl bg-surface-2 border border-line group-hover:bg-surface transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                </div>
                <span className="font-bold text-sm">Voltar ao Hub de IA</span>
            </button>

            <motion.div key={activeTab} initial="hidden" animate="show" variants={fadeInUp}>
                {activeTab === 'swarm' && <SwarmDashboard />}
                {activeTab === 'methodologies' && <SalesMethodologyStudio />}
                {activeTab === 'ai_config' && <AIConfigCenter />}
                {activeTab === 'superagent' && <SuperagentCreator />}
                {activeTab === 'scripts' && <RobustScriptGenerator />}
                {activeTab === 'automations' && <AutomationGuide />}
                {activeTab === 'generator' && <B2BGenerator />}
                {activeTab === 'tools' && <Intelligence />}

                {activeTab === 'actions' && (
                    <Card variant="default" padding="lg" accentBar>
                        <AIPendingActions />
                    </Card>
                )}

                {activeTab === 'rag' && (
                    <Card variant="default" padding="lg" accentBar>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-brand/15 border border-brand/30 flex items-center justify-center text-brand shrink-0">
                                <Database size={22} />
                            </div>
                            <div>
                                <CardTitle>Conhecimento Vetorial (RAG)</CardTitle>
                                <CardDescription>
                                    Base de dados de embeddings ativa. O Agente SDR varre essas diretrizes (playbooks, manuais e histórico) em milissegundos para gerar abordagens impecáveis e contextuais.
                                </CardDescription>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className={`p-5 bg-surface-2 border border-line rounded-card flex items-center justify-between group ${accent.hoverBorder} transition-colors`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full ${accent.bgSoft} flex items-center justify-center ${accent.text} shrink-0`}>
                                        <Target size={18} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-ink text-sm">Playbook Estratégico - Vendas B2B {accent.brandName}</p>
                                        <p className="text-[11px] font-semibold text-ink-2 mt-0.5 uppercase tracking-wider">Última sincronização há 2 horas</p>
                                    </div>
                                </div>
                                <div className="px-3 py-1 bg-success/15 text-success text-[10px] font-black uppercase tracking-widest rounded-lg border border-success/30">Ativo</div>
                            </div>
                            <div className={`p-5 bg-surface-2 border border-line rounded-card flex items-center justify-between group ${accent.hoverBorder} transition-colors`}>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-info/15 flex items-center justify-center text-info shrink-0">
                                        <Zap size={18} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-ink text-sm">{accent.isAtlas ? 'Regras ICP B2B - Logística & Frotas' : 'Regras ICP B2B - Frotas & Telemetria'}</p>
                                        <p className="text-[11px] font-semibold text-ink-2 mt-0.5 uppercase tracking-wider">Última sincronização há 5 dias</p>
                                    </div>
                                </div>
                                <div className="px-3 py-1 bg-success/15 text-success text-[10px] font-black uppercase tracking-widest rounded-lg border border-success/30">Ativo</div>
                            </div>
                        </div>
                    </Card>
                )}
            </motion.div>
        </div>
    );
}
