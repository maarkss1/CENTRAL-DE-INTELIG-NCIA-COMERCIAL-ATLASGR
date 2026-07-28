import { motion } from 'framer-motion';
import { Database, Zap, Target } from 'lucide-react';
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

export type IntelligenceTab = 'methodologies' | 'ai_config' | 'superagent' | 'scripts' | 'automations' | 'actions' | 'generator' | 'tools' | 'rag';

interface IntelligenceHubProps {
    initialTab?: IntelligenceTab;
}

export function IntelligenceHub({ initialTab = 'methodologies' }: IntelligenceHubProps) {
    const activeTab = initialTab;
    const accent = useBrandAccent();

    return (
        <div className="space-y-6">
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
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <Card variant="default" padding="lg" accentBar>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-atlas-orange/15 border border-atlas-orange/30 flex items-center justify-center text-atlas-orange shrink-0">
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
                            <div className={`p-5 bg-white/[0.03] border border-white/10 rounded-card flex items-center justify-between group ${accent.hoverBorder} transition-colors`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full ${accent.bgSoft} flex items-center justify-center ${accent.text} shrink-0`}>
                                        <Target size={18} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">Playbook Estratégico - Vendas B2B {accent.brandName}</p>
                                        <p className="text-[11px] font-semibold text-gray-400 mt-0.5 uppercase tracking-wider">Última sincronização há 2 horas</p>
                                    </div>
                                </div>
                                <div className="px-3 py-1 bg-success/15 text-success text-[10px] font-black uppercase tracking-widest rounded-lg border border-success/30">Ativo</div>
                            </div>
                            <div className={`p-5 bg-white/[0.03] border border-white/10 rounded-card flex items-center justify-between group ${accent.hoverBorder} transition-colors`}>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-info/15 flex items-center justify-center text-info shrink-0">
                                        <Zap size={18} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-white text-sm">{accent.isAtlas ? 'Regras ICP B2B - Logística & Frotas' : 'Regras ICP B2B - Frotas & Telemetria'}</p>
                                        <p className="text-[11px] font-semibold text-gray-400 mt-0.5 uppercase tracking-wider">Última sincronização há 5 dias</p>
                                    </div>
                                </div>
                                <div className="px-3 py-1 bg-success/15 text-success text-[10px] font-black uppercase tracking-widest rounded-lg border border-success/30">Ativo</div>
                            </div>
                        </div>
                    </Card>
                </motion.div>
            )}
        </div>
    );
}
