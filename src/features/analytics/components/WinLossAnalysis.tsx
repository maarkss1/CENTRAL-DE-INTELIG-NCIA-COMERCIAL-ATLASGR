import { useState } from 'react';
import { Loader2, Brain, TrendingUp, TrendingDown, AlertCircle, ChevronRight } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { api } from '../../../lib/api';

interface WinLossResult {
    analysis: string;
    generatedAt?: string;
}

function parseAnalysisSections(text: string): { title: string; content: string; icon: string }[] {
    const lines = text.split('\n').filter(l => l.trim());
    const sections: { title: string; content: string; icon: string }[] = [];

    let currentSection: { title: string; content: string; icon: string } | null = null;
    const icons = ['🏆', '⚠️', '💡'];
    let iconIdx = 0;

    for (const line of lines) {
        const isHeader = /^(\d+\.|##|###|\*\*[^*]+\*\*)/.test(line.trim());
        if (isHeader) {
            if (currentSection) sections.push(currentSection);
            currentSection = {
                title: line.replace(/^(\d+\.|##|###|\*\*|\*)/g, '').replace(/\*\*$/g, '').trim(),
                content: '',
                icon: icons[iconIdx % icons.length]
            };
            iconIdx++;
        } else if (currentSection) {
            currentSection.content += (currentSection.content ? '\n' : '') + line.trim();
        } else {
            currentSection = { title: 'Análise', content: line.trim(), icon: icons[0] };
        }
    }
    if (currentSection) sections.push(currentSection);

    return sections.length > 0 ? sections : [{ title: 'Análise Completa', content: text, icon: '📊' }];
}

export function WinLossAnalysis() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<WinLossResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const runAnalysis = async () => {
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            // Disparamos o job de análise via API e aguardamos o resultado
            const data = await api.post<WinLossResult>('/api/intelligence/win-loss-analysis', {});
            setResult({ ...data, generatedAt: new Date().toISOString() });
        } catch (err) {
            setError((err as Error).message || 'Falha ao gerar análise Win/Loss');
        } finally {
            setLoading(false);
        }
    };

    const sections = result?.analysis ? parseAnalysisSections(result.analysis) : [];

    return (
        <div className="flex-1 overflow-y-auto bg-transparent p-8">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between gap-4 border-b border-line pb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-brand/15 text-brand">
                            <Brain className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-ink">Win / Loss Analysis</h1>
                            <p className="text-sm text-ink-2">IA analisa padrões de vitórias e derrotas comerciais da semana</p>
                        </div>
                    </div>
                    <Button
                        variant="default"
                        onClick={runAnalysis}
                        disabled={loading}
                        className="shrink-0"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Analisando…
                            </>
                        ) : (
                            <>
                                <Brain className="w-4 h-4" />
                                Rodar Análise
                            </>
                        )}
                    </Button>
                </div>

                {/* Intro card */}
                {!result && !loading && !error && (
                    <Card padding="lg" className="text-center border-dashed">
                        <div className="flex flex-col items-center gap-4 py-6">
                            <div className="flex gap-6 text-4xl">
                                <TrendingUp className="w-12 h-12 text-[#199e70]" />
                                <TrendingDown className="w-12 h-12 text-[#d95926]" />
                            </div>
                            <h3 className="text-lg font-bold text-ink">Análise Inteligente de Ciclos Comerciais</h3>
                            <p className="text-sm text-ink-2 max-w-lg">
                                A IA examina as transcrições de WhatsApp, timelines e resultados
                                dos leads fechados nos últimos 7 dias. Ela identifica padrões de
                                compra, objeções recorrentes e gera 3 recomendações práticas para
                                o time comercial.
                            </p>
                            <div className="grid grid-cols-3 gap-4 mt-2 w-full max-w-md">
                                {['🏆 O que funcionou', '⚠️ Objeções encontradas', '💡 Melhorias práticas'].map((item, i) => (
                                    <div key={i} className="bg-surface-2 rounded-lg p-3 text-center border border-line">
                                        <p className="text-xs text-ink-2">{item}</p>
                                    </div>
                                ))}
                            </div>
                            <Button variant="default" onClick={runAnalysis} className="mt-2">
                                <Brain className="w-4 h-4" />
                                Gerar Análise Agora
                            </Button>
                        </div>
                    </Card>
                )}

                {/* Loading state */}
                {loading && (
                    <Card padding="lg" className="text-center">
                        <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-brand" />
                        <h3 className="text-base font-semibold text-ink mb-2">IA analisando os dados…</h3>
                        <p className="text-sm text-ink-2">
                            Processando transcrições de WhatsApp, timelines de atividades
                            e histórico de leads fechados desta semana.
                        </p>
                        <div className="mt-4 flex justify-center gap-2">
                            {['Lendo leads fechados', 'Cruzando padrões', 'Gerando insights'].map((step, i) => (
                                <span key={i} className="text-[10px] bg-surface-2 border border-line px-2 py-1 rounded-full text-ink-2 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }}>
                                    {step}
                                </span>
                            ))}
                        </div>
                    </Card>
                )}

                {/* Error state */}
                {error && (
                    <Card padding="lg" className="text-center border-[#d95926]/40">
                        <AlertCircle className="w-8 h-8 mx-auto mb-3 text-[#d95926]" />
                        <p className="text-sm font-semibold text-ink mb-1">Falha ao gerar análise</p>
                        <p className="text-xs text-ink-2 mb-4">{error}</p>
                        <Button variant="outline" onClick={runAnalysis}>Tentar novamente</Button>
                    </Card>
                )}

                {/* Results */}
                {result && sections.length > 0 && (
                    <div className="space-y-4">
                        {result.generatedAt && (
                            <p className="text-[11px] text-ink-2 text-right">
                                Gerado em {new Date(result.generatedAt).toLocaleString('pt-BR')}
                            </p>
                        )}

                        {sections.map((section, i) => (
                            <Card key={i} padding="lg" className="hover:border-brand/40 transition-colors">
                                <div className="flex items-start gap-3">
                                    <span className="text-2xl shrink-0 mt-0.5">{section.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-brand bg-brand/10 px-2 py-0.5 rounded-full">
                                                Insight {i + 1}
                                            </span>
                                            <ChevronRight className="w-3 h-3 text-ink-2" />
                                        </div>
                                        <h3 className="text-sm font-bold text-ink mb-2">{section.title}</h3>
                                        <p className="text-sm text-ink-2 leading-relaxed whitespace-pre-wrap">
                                            {section.content}
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        ))}

                        <Card padding="sm" className="border-dashed text-center">
                            <p className="text-xs text-ink-2">
                                💡 Esta análise é gerada automaticamente toda sexta às 19h e pode ser rodada manualmente a qualquer momento.
                            </p>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
