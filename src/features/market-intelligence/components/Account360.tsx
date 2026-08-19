import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card.js';
import { Button } from '../../../components/ui/Button.js';
import { EmptyState } from '../../../components/ui/EmptyState.js';
import { Building2, AlertCircle, Loader2, ArrowLeft, Target, TrendingUp, Zap, Users, BrainCircuit } from 'lucide-react';
// As tabs não estão no /ui/, o padrão antigo pode não existir localmente, então mock de layout ou uso do que existe
// Aqui farei tabs customizados para não depender de pacotes não instalados.

export function Account360() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [intelligence, setIntelligence] = useState<any>(null);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        const fetchIntelligence = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/market-intelligence/accounts/${id}/intelligence`);
                const data = await res.json();
                if (data.success) {
                    setIntelligence(data.data);
                } else {
                    setError('Não foi possível carregar os dados.');
                }
            } catch (err) {
                setError('Erro ao se comunicar com o servidor.');
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchIntelligence();
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen space-x-3 text-emerald-500">
                <Loader2 className="w-10 h-10 animate-spin" />
                <span className="text-lg font-medium">Carregando Inteligência...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen text-rose-500 space-y-4">
                <AlertCircle className="w-12 h-12" />
                <span className="text-xl font-semibold">{error}</span>
                <Button variant="outline" onClick={() => window.location.reload()}>Tentar Novamente</Button>
            </div>
        );
    }

    const tabs = [
        { id: 'overview', label: 'Visão Geral' },
        { id: 'signals', label: 'Sinais' },
        { id: 'decision-makers', label: 'Decisores' },
        { id: 'economic-group', label: 'Grupo Econômico' },
        { id: 'crm', label: 'CRM / Histórico' },
        { id: 'recommendations', label: 'Recomendações' },
    ];

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/10 pb-6 gap-4">
                <div className="flex items-start md:items-center space-x-4">
                    <Button variant="ghost" onClick={() => navigate(-1)} className="hover:bg-white/5">
                        <ArrowLeft className="w-5 h-5 mr-2" /> Voltar
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold text-white flex items-center tracking-tight">
                            <Building2 className="w-8 h-8 mr-3 text-emerald-500" />
                            Conta: {id}
                        </h1>
                        <p className="text-sm text-white/50 mt-1 flex items-center">
                            <Zap className="w-4 h-4 mr-1" /> Última atualização: {intelligence?.generatedAt ? new Date(intelligence.generatedAt).toLocaleString() : 'Não disponível'}
                        </p>
                    </div>
                </div>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20" onClick={() => fetch(`/api/market-intelligence/accounts/${id}/refresh`, { method: 'POST' })}>
                    <BrainCircuit className="w-4 h-4 mr-2" />
                    Atualizar Inteligência
                </Button>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="bg-gradient-to-br from-white/5 to-transparent border-white/10">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white/70 flex items-center"><Target className="w-4 h-4 mr-2 text-blue-400"/>Account Score</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold text-white">N/A</div></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-white/5 to-transparent border-white/10">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white/70 flex items-center"><TrendingUp className="w-4 h-4 mr-2 text-emerald-400"/>ICP / Fit</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold text-white">N/A</div></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-white/5 to-transparent border-white/10">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white/70 flex items-center"><Zap className="w-4 h-4 mr-2 text-amber-400"/>Intent</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold text-white">N/A</div></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-white/5 to-transparent border-white/10">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white/70 flex items-center"><Users className="w-4 h-4 mr-2 text-purple-400"/>Novos Sinais</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold text-white">0</div></CardContent>
                </Card>
            </div>

            <div className="border-b border-white/10">
                <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`${
                                activeTab === tab.id
                                    ? 'border-emerald-500 text-emerald-400'
                                    : 'border-transparent text-white/60 hover:text-white/80 hover:border-white/30'
                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>
            
            <div className="mt-6">
                {activeTab === 'overview' && (
                    <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                        <CardHeader><CardTitle className="text-lg">Resumo Executivo (IA)</CardTitle></CardHeader>
                        <CardContent>
                            <p className="text-white/80 leading-relaxed text-lg">
                                {intelligence?.summary || 'Nenhum resumo de inteligência foi gerado para esta conta ainda.'}
                            </p>
                        </CardContent>
                    </Card>
                )}
                
                {activeTab !== 'overview' && (
                    <EmptyState 
                        icon={<AlertCircle className="w-8 h-8 text-amber-400" />}
                        title="Sem dados" 
                        description={`Não há registros disponíveis para ${tabs.find(t => t.id === activeTab)?.label?.toLowerCase()}.`} 
                    />
                )}
            </div>
        </div>
    );
}
