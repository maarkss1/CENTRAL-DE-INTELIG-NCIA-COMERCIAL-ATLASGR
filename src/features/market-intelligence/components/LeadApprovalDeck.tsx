import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../../components/ui/Card.js';
import { Button } from '../../../components/ui/Button.js';
import { Badge } from '../../../components/ui/Badge.js';
import { ThumbsUp, ThumbsDown, BrainCircuit } from 'lucide-react';

export function LeadApprovalDeck() {
    const [accounts, setAccounts] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState<string | null>(null);

    useEffect(() => {
        // Fetch top accounts (MUITO_ALTO or ALTO)
        fetch('/api/market-intelligence/companies?icpMinimo=ALTO&pageSize=10')
            .then(res => res.json())
            .then(data => {
                setAccounts(data.data?.items || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const handleAction = async (approved: boolean) => {
        const account = accounts[currentIndex];
        if (approved) {
            setFeedback(`${account.razaoSocial} foi aprovado para o CRM.`);
        } else {
            setFeedback(`${account.razaoSocial} descartado.`);
        }
        setCurrentIndex(prev => prev + 1);
    };

    if (loading) return <div className="p-8 text-center text-emerald-400">Carregando IA Deck...</div>;
    if (currentIndex >= accounts.length) return <div className="p-8 text-center text-slate-400">Você zerou os leads de hoje! 🎉</div>;

    const account = accounts[currentIndex];

    return (
        <div className="flex flex-col items-center justify-center p-8 min-h-[600px] bg-slate-950">
            <h1 className="text-2xl text-emerald-400 mb-8 font-bold flex items-center gap-2"><BrainCircuit /> LDR - Aprovação Ágil</h1>
            {feedback && (
                <div className="mb-4 p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded text-sm max-w-md w-full text-center">
                    {feedback}
                </div>
            )}
            <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-cyan-500" />
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <CardTitle className="text-xl text-slate-100">{account.nomeFantasia || account.razaoSocial}</CardTitle>
                        <Badge variant="outline" className="text-emerald-400 border-emerald-900">{account.icpMinimo || 'FIT ALTO'}</Badge>
                    </div>
                    <p className="text-sm text-slate-400">{account.cnpj}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 bg-slate-950 rounded border border-slate-800">
                        <p className="text-sm text-slate-300">
                            <strong>Capital Social:</strong> R$ {Number(account.capitalSocial || 0).toLocaleString('pt-BR')}
                        </p>
                        <p className="text-sm text-slate-300">
                            <strong>Local:</strong> {account.municipio} - {account.uf}
                        </p>
                    </div>
                    <div className="text-xs text-slate-500">
                        Sinais: {account.newsMentions?.length ? account.newsMentions.length + " Notícias recentes" : 'Detectado expansão e crescimento.'}
                    </div>
                </CardContent>
                <CardFooter className="flex justify-between gap-4 mt-4">
                    <Button variant="destructive" className="w-full" onClick={() => handleAction(false)}>
                        <ThumbsDown className="mr-2 h-4 w-4" /> Descartar
                    </Button>
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-500" onClick={() => handleAction(true)}>
                        <ThumbsUp className="mr-2 h-4 w-4" /> Aprovar
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
