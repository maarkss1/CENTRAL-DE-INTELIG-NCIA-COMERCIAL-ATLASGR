import { useState, useEffect } from 'react';
import { Bot, Save, Plus, Loader2 } from 'lucide-react';
import api from '../../../lib/api';

interface Prompt {
    id: string;
    name: string;
    category: string;
    variables: Record<string, any>;
}

export function PromptStudio() {
    const [prompts, setPrompts] = useState<Prompt[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('cadence_sequence');
    const [tone, setTone] = useState<string>('');

    const TOOLS = [
        { id: 'cadence_sequence', name: 'Sequência de Cadência (5 Dias)' },
        { id: 'script_call', name: 'Script de Cold Call' },
        { id: 'roi_pitch', name: 'Argumento de ROI Financeiro' },
        { id: 'competitor_battlecard', name: 'Contorno de Concorrente' },
    ];

    useEffect(() => {
        loadPrompts();
    }, []);

    const loadPrompts = async () => {
        try {
            const res = await api.get('/api/prompts');
            setPrompts(res.data.data);
            
            // Tenta carregar o tom salvo
            const current = res.data.data.find((p: Prompt) => p.category === selectedCategory);
            if (current?.variables?.tone) setTone(current.variables.tone);
        } catch (error) {
            console.error('Failed to load prompts', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCategoryChange = (cat: string) => {
        setSelectedCategory(cat);
        const current = prompts.find(p => p.category === cat);
        setTone(current?.variables?.tone || '');
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const existing = prompts.find(p => p.category === selectedCategory);
            if (existing) {
                await api.put(`/api/prompts/${existing.id}`, {
                    variables: { ...existing.variables, tone }
                });
            } else {
                await api.post('/api/prompts', {
                    name: `Instruções para ${selectedCategory}`,
                    category: selectedCategory,
                    variables: { tone }
                });
            }
            await loadPrompts();
            alert('Configurações do modelo atualizadas e em produção!');
        } catch (error) {
            console.error('Failed to save', error);
            alert('Erro ao salvar as regras do modelo.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Bot className="h-8 w-8 text-purple-600" />
                    AI Prompt Studio
                </h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Sintonize o tom de voz e injete regras de negócio direto no cérebro da Inteligência Artificial do Prospector Atlas.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="col-span-1 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4">
                        Habilidades da IA
                    </h2>
                    <div className="space-y-2">
                        {TOOLS.map(tool => (
                            <button
                                key={tool.id}
                                onClick={() => handleCategoryChange(tool.id)}
                                className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                                    selectedCategory === tool.id 
                                        ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800' 
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                }`}
                            >
                                {tool.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="col-span-2 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
                    <div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Diretrizes de Tom de Voz</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Instruções que a IA deve respeitar OBRIGATORIAMENTE ao gerar este tipo de conteúdo.
                        </p>
                        
                        <textarea
                            value={tone}
                            onChange={(e) => setTone(e.target.value)}
                            rows={6}
                            placeholder="Ex: Seja altamente consultivo, evite gírias, foque na redução de custo operacional..."
                            className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm font-mono p-3"
                        />
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                        <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300">Como funciona o Override?</h4>
                        <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">
                            As regras que você salvar aqui serão injetadas dinamicamente no pipeline de LLM (`gemini-2.5-pro`) da Atlas, substituindo comportamentos padrão. As alterações entram em vigor imediatamente para todos os SDRs.
                        </p>
                    </div>

                    <div className="flex justify-end pt-4">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
                        >
                            {saving ? (
                                <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                            ) : (
                                <Save className="-ml-1 mr-2 h-4 w-4" />
                            )}
                            Salvar Regras da IA
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
