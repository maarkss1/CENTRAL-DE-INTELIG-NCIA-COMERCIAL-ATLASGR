import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Building2, Linkedin, Mail, MapPin } from 'lucide-react';
import { api } from '../../../../lib/api';
import { Card, CardTitle, CardDescription } from '../../../../components/ui/Card';
import { useBrandAccent } from '../../../../hooks/useBrandAccent';
import { fadeInUp, staggerContainer, staggerItem, SPRING_SOFT } from '../../../../lib/motion';
import { GooglePlacesTool } from './tools/GooglePlacesTool';
import { ApolloTool } from './tools/ApolloTool';
import { HunterTool } from './tools/HunterTool';
import { LinkedInTool } from './tools/LinkedInTool';
import type { ToolsStatus } from './tools/shared';

type ToolId = 'google-places' | 'apollo' | 'hunter' | 'linkedin';

const TOOL_TABS: { id: ToolId; label: string; icon: typeof MapPin; description: string; statusKey: keyof Omit<ToolsStatus, 'providerMode'> }[] = [
    { id: 'google-places', label: 'Google Places', icon: MapPin, description: 'Busca empresas por categoria e região, só via Google Places (New) Text Search — sem outras fontes misturadas.', statusKey: 'googlePlaces' },
    { id: 'apollo', label: 'Apollo.io', icon: Building2, description: 'Busca firmográfica de empresas por ICP (segmento, porte, região), só via Apollo Organization Search.', statusKey: 'apollo' },
    { id: 'hunter', label: 'Hunter.io', icon: Mail, description: 'Encontra e verifica e-mails reais de pessoas a partir do domínio de uma empresa, só via Hunter.io.', statusKey: 'hunter' },
    { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, description: 'Busca empresas e decisores com perfil real de LinkedIn (via Apollo), mais um gerador de link manual.', statusKey: 'apollo' },
];

/**
 * Grade de ferramentas de prospecção independentes — uma por API — no mesmo padrão de
 * `IntelligenceHub.tsx` (grid de cards → abre a ferramenta escolhida → botão "Voltar"). Cada
 * ferramenta chama só a integração que representa, sem o encadeamento multi-provider da aba
 * "Radar Discovery".
 */
export function ProspectingToolsHub() {
    const [activeTool, setActiveTool] = useState<ToolId | null>(null);
    const [status, setStatus] = useState<ToolsStatus | null>(null);
    const accent = useBrandAccent();

    useEffect(() => {
        api.get<ToolsStatus>('/api/prospecting/tools/status').then(setStatus).catch(() => setStatus(null));
    }, []);

    if (activeTool === null) {
        return (
            <div className="space-y-6">
                <header>
                    <h2 className="font-display text-xl font-bold text-ink tracking-tight">Ferramentas de Prospecção</h2>
                    <p className="text-sm text-ink-2 mt-1">Escolha uma fonte para prospectar isoladamente, sem misturar com as outras.</p>
                </header>

                <motion.nav
                    aria-label="Ferramentas de Prospecção"
                    variants={staggerContainer()}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
                >
                    {TOOL_TABS.map((tool) => {
                        const Icon = tool.icon;
                        const configured = status?.[tool.statusKey]?.configured;
                        return (
                            <motion.button
                                key={tool.id}
                                type="button"
                                variants={staggerItem}
                                whileHover={{ y: -4 }}
                                whileTap={{ scale: 0.97 }}
                                transition={SPRING_SOFT}
                                onClick={() => setActiveTool(tool.id)}
                                className="text-left cursor-pointer group"
                            >
                                <Card
                                    variant="default"
                                    padding="sm"
                                    className={`h-full transition-all duration-300 ${accent.hoverBorder} group-hover:bg-surface-2 group-focus-visible:bg-surface-2 group-hover:shadow-lg group-focus-visible:shadow-lg`}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className={`w-9 h-9 rounded-xl ${accent.bgSoft} flex items-center justify-center ${accent.text} shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-focus-visible:scale-110`}>
                                            <Icon size={16} />
                                        </div>
                                        {status && configured === false && (
                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-warn/15 text-amber-600 dark:text-amber-400 border border-warn/30">
                                                Não configurado
                                            </span>
                                        )}
                                    </div>
                                    <CardTitle className={`${accent.text} text-sm`}>{tool.label}</CardTitle>
                                    <CardDescription className="mt-1 text-xs leading-snug line-clamp-3">{tool.description}</CardDescription>
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

    const activeMeta = TOOL_TABS.find((t) => t.id === activeTool)!;
    const configured = status?.[activeMeta.statusKey]?.configured ?? false;

    return (
        <div className="space-y-6">
            <button
                type="button"
                onClick={() => setActiveTool(null)}
                className="flex items-center gap-2 text-ink-2 hover:text-ink transition-colors group cursor-pointer"
            >
                <div className="p-2 rounded-xl bg-surface-2 border border-line group-hover:bg-surface transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                </div>
                <span className="font-bold text-sm">Voltar às Ferramentas</span>
            </button>

            <motion.div key={activeTool} initial="hidden" animate="show" variants={fadeInUp}>
                {activeTool === 'google-places' && <GooglePlacesTool configured={configured} />}
                {activeTool === 'apollo' && <ApolloTool configured={configured} />}
                {activeTool === 'hunter' && <HunterTool configured={configured} />}
                {activeTool === 'linkedin' && <LinkedInTool configured={configured} />}
            </motion.div>
        </div>
    );
}
