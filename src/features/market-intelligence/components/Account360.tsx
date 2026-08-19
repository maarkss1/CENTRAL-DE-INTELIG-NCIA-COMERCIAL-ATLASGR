import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card.js';
import { Button } from '../../../components/ui/button.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs.js';
import { Building2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';

export function Account360() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [intelligence, setIntelligence] = useState<any>(null);

    useEffect(() => {
        const fetchIntelligence = async () => {
            try {
                setLoading(true);
                // Stubbing fetch from Phase 1 APIs
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
            <div className="flex items-center justify-center h-screen space-x-2 text-white/50">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span>Carregando Account 360...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen text-red-400 space-y-4">
                <AlertCircle className="w-12 h-12" />
                <span>{error}</span>
                <Button variant="outline" onClick={() => window.location.reload()}>Tentar Novamente</Button>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <header className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center space-x-4">
                    <Button variant="ghost" onClick={() => navigate(-1)}>
                        <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
                    </Button>
                    <div>
                        <h1 className="text-2xl font-semibold text-white flex items-center">
                            <Building2 className="w-6 h-6 mr-2" />
                            Conta: {id}
                        </h1>
                        <p className="text-sm text-white/60">Última atualização: {intelligence?.generatedAt ? new Date(intelligence.generatedAt).toLocaleString() : 'Não disponível'}</p>
                    </div>
                </div>
                <Button onClick={() => fetch(`/api/market-intelligence/accounts/${id}/refresh`, { method: 'POST' })}>
                    Atualizar Inteligência
                </Button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card><CardHeader><CardTitle className="text-sm">Account Score</CardTitle></CardHeader><CardContent>N/A</CardContent></Card>
                <Card><CardHeader><CardTitle className="text-sm">ICP / Fit</CardTitle></CardHeader><CardContent>N/A</CardContent></Card>
                <Card><CardHeader><CardTitle className="text-sm">Intent</CardTitle></CardHeader><CardContent>N/A</CardContent></Card>
                <Card><CardHeader><CardTitle className="text-sm">Novos Sinais</CardTitle></CardHeader><CardContent>0</CardContent></Card>
            </div>

            <Tabs defaultValue="overview">
                <TabsList>
                    <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                    <TabsTrigger value="signals">Sinais</TabsTrigger>
                    <TabsTrigger value="decision-makers">Decisores</TabsTrigger>
                    <TabsTrigger value="economic-group">Grupo Econômico</TabsTrigger>
                    <TabsTrigger value="crm">CRM / Histórico</TabsTrigger>
                    <TabsTrigger value="recommendations">Recomendações</TabsTrigger>
                    <TabsTrigger value="evidence">Evidências</TabsTrigger>
                </TabsList>
                
                <TabsContent value="overview">
                    <Card>
                        <CardHeader><CardTitle>Resumo Executivo (IA)</CardTitle></CardHeader>
                        <CardContent>
                            <p className="text-white/80">{intelligence?.summary || 'Nenhum resumo disponível.'}</p>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                <TabsContent value="signals">
                    <div className="text-white/50 text-center py-10">Nenhum sinal detectado recentemente.</div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
