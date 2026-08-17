import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    Database, Bot, GraduationCap, Settings, Sparkles,
    FileText, Workflow, CheckSquare, Wand2, Search, ArrowLeft, ArrowRight,
    Loader2, AlertTriangle, ArrowUpRight,
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
import { Button } from '../../../components/ui/Button';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { fadeInUp, staggerContainer, staggerItem, SPRING_SOFT } from '../../../lib/motion';
import { knowledgeApi, type KnowledgeDocumentSummary } from '../../knowledge/knowledge.api';

import { SwarmDashboard } from './SwarmDashboard';
import { AISuiteHub } from './AISuiteHub';
import { Cpu } from 'lucide-react';

export type IntelligenceTab = 'ai_suite' | 'swarm' | 'methodologies' | 'ai_config' | 'superagent' | 'scripts' | 'automations' | 'actions' | 'generator' | 'tools' | 'rag';

interface IntelligenceHubProps {
    initialTab?: IntelligenceTab;
}

// O Hub de IA sempre abre na grade de ferramentas (nunca direto numa ferramenta padrão) — o
// usuário escolhe qual IA quer usar a partir dos cards, depois volta pra grade pelo botão "Voltar".
// `initialTab` continua existindo só para um eventual deep-link futuro; hoje nenhum chamador o passa.
const TOOL_TABS: { id: IntelligenceTab; label: string; icon: typeof Bot | typeof Cpu; description: string }[] = [
    { id: 'ai_suite', label: 'Suíte dos 20 Motores de IA', icon: Cpu, description: 'Console interativo para executar e orquestrar os 20 motores de IA (Ollama & Cloud) da plataforma.' },
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

function formatRelativeDate(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.round(diffMs / 60_000);
    if (diffMin < 1) return 'agora mesmo';
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `há ${diffHours}h`;
    const diffDays = Math.round(diffHours / 24);
    return `há ${diffDays} dia${diffDays === 1 ? '' : 's'}`;
}

export function IntelligenceHub({ initialTab }: IntelligenceHubProps) {
    const [activeTab, setActiveTab] = useState<IntelligenceTab | null>(initialTab ?? null);
    const accent = useBrandAccent();

    // Estado real da Base de Conhecimento (RAG) — nunca dados fabricados. Ver AGENTS.md, bloqueador
    // #6 ("dados fictícios misturados a dados reais"): o card desta aba já mostrou "última
    // sincronização há 2 horas" hardcoded para documentos que não existiam no banco. Reaproveita o
    // mesmo `knowledgeApi` já usado pela tela completa de Base de Conhecimento (`/knowledge`), sem
    // duplicar o pipeline de ingestão/busca — só um resumo, com link para a tela cheia.
    const [ragDocuments, setRagDocuments] = useState<KnowledgeDocumentSummary[] | null>(null);
    const [ragError, setRagError] = useState<string | null>(null);
    const [ragLoading, setRagLoading] = useState(false);

    const loadRagSummary = useCallback(async () => {
        setRagLoading(true);
        setRagError(null);
        try {
            setRagDocuments(await knowledgeApi.list());
        } catch (err) {
            setRagError((err as Error).message);
        } finally {
            setRagLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'rag') void loadRagSummary();
    }, [activeTab, loadRagSummary]);

    if (activeTab === null) {
        return (
            <div className="flex-1 overflow-y-auto bg-transparent p-6 md:p-8 space-y-6">
                <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-line/60">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h1 className="font-display text-2xl font-bold text-ink tracking-tight">Hub de IA</h1>
                            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
                                20 Motores Ativos
                            </span>
                        </div>
                        <p className="text-sm text-ink-2">Orquestrador unificado de agentes autônomos, metodologias B2B e motores cognitivos sincronizados.</p>
                    </div>
                    <div className="flex items-center gap-3 bg-surface-2/80 backdrop-blur px-3.5 py-2 rounded-2xl border border-line text-xs text-ink-2 shadow-sm shrink-0">
                        <div className="flex items-center gap-1.5 font-medium text-ink">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Sincronia Global
                        </div>
                        <div className="h-3.5 w-px bg-line"></div>
                        <span className="hidden sm:inline">Groq + RAG + Multi-Search</span>
                        <div className="h-3.5 w-px bg-line hidden sm:block"></div>
                        <span className="text-brand font-medium">RLS Ativo</span>
                    </div>
                </header>

                <motion.nav
                    aria-label="Ferramentas do Hub de IA"
                    variants={staggerContainer()}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
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
                                    padding="sm"
                                    className={`h-full transition-all duration-300 ${accent.hoverBorder} group-hover:bg-surface-2 group-focus-visible:bg-surface-2 group-hover:shadow-lg group-focus-visible:shadow-lg`}
                                >
                                    <div className={`w-9 h-9 rounded-xl ${accent.bgSoft} flex items-center justify-center ${accent.text} shrink-0 mb-3 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-focus-visible:scale-110`}>
                                        <Icon size={16} />
                                    </div>
                                    <CardTitle className={`${accent.text} text-sm`}>{tab.label}</CardTitle>
                                    <CardDescription className="mt-1 text-xs leading-snug line-clamp-2">{tab.description}</CardDescription>
                                    <span className={`mt-3 inline-flex items-center gap-1 text-xs font-bold ${accent.text} opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-all duration-300 group-hover:translate-x-0.5`}>
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
        <div className="flex-1 overflow-y-auto bg-transparent p-6 md:p-8 space-y-6">
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
                {activeTab === 'ai_suite' && <AISuiteHub />}
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
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-brand/15 border border-brand/30 flex items-center justify-center text-brand shrink-0">
                                    <Database size={22} />
                                </div>
                                <div>
                                    <CardTitle>Conhecimento Vetorial (RAG)</CardTitle>
                                    <CardDescription>
                                        Documentos reais indexados nesta organização. O Agente SDR consulta esta mesma
                                        base (busca híbrida semântica + palavra-chave) para gerar abordagens contextuais —
                                        nunca inventa uma fonte que não está aqui.
                                    </CardDescription>
                                </div>
                            </div>
                            <Button asChild variant="outline" className="shrink-0 whitespace-nowrap">
                                <Link to="/knowledge">
                                    Gerenciar base <ArrowUpRight className="w-4 h-4 ml-1.5" />
                                </Link>
                            </Button>
                        </div>

                        {ragLoading && (
                            <div className="flex items-center justify-center gap-2 text-sm text-ink-2 py-8">
                                <Loader2 className="w-4 h-4 animate-spin" /> Carregando documentos…
                            </div>
                        )}

                        {!ragLoading && ragError && (
                            <div className="text-center py-8">
                                <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-400" />
                                <p className="text-sm text-ink-2 mb-4">{ragError}</p>
                                <Button variant="outline" onClick={() => void loadRagSummary()}>Tentar novamente</Button>
                            </div>
                        )}

                        {!ragLoading && !ragError && ragDocuments !== null && ragDocuments.length === 0 && (
                            <div className="text-center py-8 border border-dashed border-line rounded-card">
                                <Database className="w-10 h-10 mx-auto mb-3 text-ink-2" />
                                <p className="text-sm font-semibold text-ink mb-1">Nenhum documento indexado ainda</p>
                                <p className="text-xs text-ink-2 mb-4 max-w-sm mx-auto">
                                    Sem documentos, o Agente SDR não tem playbook para consultar — ele avisa isso em
                                    vez de inventar uma resposta.
                                </p>
                                <Button asChild variant="outline">
                                    <Link to="/knowledge">Enviar o primeiro documento</Link>
                                </Button>
                            </div>
                        )}

                        {!ragLoading && !ragError && ragDocuments !== null && ragDocuments.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-xs font-semibold text-ink-2 uppercase tracking-wider">
                                    {ragDocuments.length} documento{ragDocuments.length === 1 ? '' : 's'} ·{' '}
                                    {ragDocuments.reduce((sum, d) => sum + d.chunkCount, 0)} trecho(s) vetorizado(s)
                                </p>
                                {ragDocuments.slice(0, 5).map((doc) => (
                                    <div
                                        key={doc.id}
                                        className={`p-5 bg-surface-2 border border-line rounded-card flex items-center justify-between group ${accent.hoverBorder} transition-colors`}
                                    >
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className={`w-10 h-10 rounded-full ${accent.bgSoft} flex items-center justify-center ${accent.text} shrink-0`}>
                                                <FileText size={18} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-ink text-sm truncate">{doc.title}</p>
                                                <p className="text-[11px] font-semibold text-ink-2 mt-0.5 uppercase tracking-wider">
                                                    {doc.chunkCount} trecho{doc.chunkCount === 1 ? '' : 's'} · atualizado {formatRelativeDate(doc.updatedAt)}
                                                </p>
                                            </div>
                                        </div>
                                        <div className={`shrink-0 px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border ${doc.chunkCount > 0 ? 'bg-success/15 text-success border-success/30' : 'bg-amber-500/15 text-amber-400 border-amber-500/30'}`}>
                                            {doc.chunkCount > 0 ? 'Indexado' : 'Sem trechos'}
                                        </div>
                                    </div>
                                ))}
                                {ragDocuments.length > 5 && (
                                    <Link to="/knowledge" className="block text-center text-xs font-semibold text-ink-2 hover:text-ink transition-colors pt-1">
                                        Ver todos os {ragDocuments.length} documentos →
                                    </Link>
                                )}
                            </div>
                        )}
                    </Card>
                )}
            </motion.div>
        </div>
    );
}
