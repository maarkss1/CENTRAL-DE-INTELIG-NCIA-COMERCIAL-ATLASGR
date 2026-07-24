import { useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import {
    IconBrain, IconSparkle, IconCheck, IconZap, IconCode, IconLayers
} from '../../../components/icons';

interface PromptTool {
    id: string;
    name: string;
    category: string;
    description: string;
    variables: string[];
    systemPrompt: string;
    active: boolean;
}

const INITIAL_PROMPTS: PromptTool[] = [
    {
        id: 'cold_email',
        name: 'Gerador de Cold Email Hyper-Personalizado',
        category: 'Prospecção',
        description: 'Cria abordagens diretas com base no segmento, porte e dores da transportadora.',
        variables: ['tone', 'icp_focus', 'call_to_action'],
        systemPrompt: 'Você é um executivo de vendas senior da AtlasGR. Crie uma abordagem objetiva destacando redução de sinistro e ROI.',
        active: true
    },
    {
        id: 'script_call',
        name: 'Roteiro de Cold Call (Spin Selling)',
        category: 'Qualificação',
        description: 'Estrutura o roteiro de ligação com perguntas de Situação, Problema, Implicação e Necessidade.',
        variables: ['persona_role', 'objection_preemption'],
        systemPrompt: 'Você é o Agente SDR da AtlasGR. Conduza uma qualificação de risco para gerentes de logística.',
        active: true
    },
    {
        id: 'cadence_sequence',
        name: 'Sequenciador de Cadências (5 Passos)',
        category: 'Automação',
        description: 'Gera fluxo multicanal (Email -> LinkedIn -> Ligar -> WhatsApp -> Break-up).',
        variables: ['channel_mix', 'cadence_speed'],
        systemPrompt: 'Gere uma cadência completa de 5 contatos estratégicos para decisores de transporte.',
        active: true
    },
    {
        id: 'roi_pitch',
        name: 'Calculadora de ROI & Pitch Executivo',
        category: 'Fechamento',
        description: 'Calcula economia em apólices PGR e sinistros evitados.',
        variables: ['fleet_size', 'avg_claim_cost'],
        systemPrompt: 'Apresente uma proposta financeira quantificada ressaltando o payback em menos de 90 dias.',
        active: true
    }
];

export function PromptStudio() {
    const [prompts, setPrompts] = useState<PromptTool[]>(INITIAL_PROMPTS);
    const [selectedPrompt, setSelectedPrompt] = useState<PromptTool>(INITIAL_PROMPTS[0]);
    const [customRule, setCustomRule] = useState('');
    const [savedMessage, setSavedMessage] = useState(false);

    const handleSavePrompt = () => {
        setPrompts(prev => prev.map(p => p.id === selectedPrompt.id ? { ...selectedPrompt, systemPrompt: selectedPrompt.systemPrompt + (customRule ? `\nRegra Extra: ${customRule}` : '') } : p));
        setCustomRule('');
        setSavedMessage(true);
        setTimeout(() => setSavedMessage(false), 3000);
    };

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6 sm:p-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl">
                                <IconBrain className="w-6 h-6" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-atlas-dark">AtlasGR Commercial OS</h1>
                                <p className="text-xs font-semibold text-orange-600 uppercase tracking-widest">AI Prompt Studio & Control Center</p>
                            </div>
                        </div>
                        <p className="text-atlas-dark/50 text-sm">Gerencie, ajuste e teste os comandos de inteligência artificial da plataforma AtlasGR.</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Badge variant="warning">
                            <IconSparkle className="w-3.5 h-3.5" /> Prompt Engine v2.4
                        </Badge>
                    </div>
                </div>

                {/* Grid principal */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                    {/* Lista de Ferramentas / Prompts */}
                    <div className="lg:col-span-4 space-y-3">
                        <h2 className="text-xs font-bold text-atlas-dark/40 uppercase tracking-wider px-1 flex items-center gap-2">
                            <IconLayers className="w-4 h-4" /> Motores de IA Disponíveis
                        </h2>
                        {prompts.map(prompt => (
                            <button
                                key={prompt.id}
                                onClick={() => setSelectedPrompt(prompt)}
                                className={`w-full text-left p-4 rounded-xl border transition-all text-sm ${selectedPrompt.id === prompt.id ? 'bg-white border-orange-500 shadow-md ring-2 ring-orange-500/10' : 'bg-white/80 border-black/5 hover:border-black/15 hover:bg-white'}`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">
                                        {prompt.category}
                                    </span>
                                    {prompt.active && (
                                        <span className="flex items-center gap-1 text-[11px] text-green-600 font-semibold">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Ativo
                                        </span>
                                    )}
                                </div>
                                <h3 className="font-bold text-atlas-dark mb-1">{prompt.name}</h3>
                                <p className="text-xs text-atlas-dark/50 line-clamp-2">{prompt.description}</p>
                            </button>
                        ))}
                    </div>

                    {/* Editor de Prompt & Regras */}
                    <div className="lg:col-span-8 space-y-6">
                        <Card className="p-6">
                            <div className="flex items-center justify-between border-b border-black/5 pb-4 mb-4">
                                <div>
                                    <h2 className="text-lg font-bold text-atlas-dark">{selectedPrompt.name}</h2>
                                    <p className="text-xs text-atlas-dark/50">ID da ferramenta: <code className="bg-black/5 px-1.5 py-0.5 rounded">{selectedPrompt.id}</code></p>
                                </div>
                                <Badge variant="neutral">
                                    <IconCode className="w-3.5 h-3.5" /> System Prompt
                                </Badge>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-atlas-dark/60 uppercase tracking-wider mb-2">
                                        Prompt Base do Sistema
                                    </label>
                                    <textarea
                                        rows={4}
                                        value={selectedPrompt.systemPrompt}
                                        onChange={e => setSelectedPrompt({ ...selectedPrompt, systemPrompt: e.target.value })}
                                        className="w-full p-3 rounded-xl border border-black/10 text-sm bg-black/[0.02] font-mono text-atlas-dark focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-atlas-dark/60 uppercase tracking-wider mb-2">
                                        Adicionar Regra Dinâmica / Instrução Extra
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Forçar tom mais agressivo para frota acima de 50 caminhões..."
                                        value={customRule}
                                        onChange={e => setCustomRule(e.target.value)}
                                        className="w-full p-3 rounded-xl border border-black/10 text-sm bg-white text-atlas-dark focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-atlas-dark/60 uppercase tracking-wider mb-2">
                                        Variáveis Aceitas
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedPrompt.variables.map(v => (
                                            <span key={v} className="text-xs font-mono bg-orange-50 text-orange-700 px-2.5 py-1 rounded-lg border border-orange-200">
                                                {`{{${v}}}`}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-black/5 flex items-center justify-between">
                                    {savedMessage ? (
                                        <span className="text-xs font-bold text-green-600 flex items-center gap-1.5">
                                            <IconCheck className="w-4 h-4" /> Prompt salvo com sucesso!
                                        </span>
                                    ) : (
                                        <span className="text-xs text-atlas-dark/40">Alterações aplicadas imediatamente em tempo de execução.</span>
                                    )}

                                    <button
                                        onClick={handleSavePrompt}
                                        className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-sm transition-all shadow-md flex items-center gap-2"
                                    >
                                        <IconZap className="w-4 h-4" /> Salvar & Atualizar IA
                                    </button>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
