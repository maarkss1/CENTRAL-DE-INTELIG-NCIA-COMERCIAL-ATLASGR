import { useState } from 'react';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { commercialIntelligenceApi, type CommercialFilter } from '../commercialIntelligence.api';

/**
 * Narrativa em linguagem natural sobre o cockpit — nunca calcula nada sozinha, só resume os
 * números que a Visão Executiva já mostra (ver `CommercialIntelligenceAiService.
 * generateExecutiveSummary`, grounded nos mesmos `executiveOverview`/`alerts`/`aging` desta tela).
 * Geração é sempre por clique explícito — nunca dispara IA sozinha ao abrir a aba (custo real por
 * chamada, e a regra do módulo de nunca fabricar automatismo sem o usuário pedir).
 */
export function AiExecutiveSummaryCard({ filter }: { filter: CommercialFilter }) {
    const [summary, setSummary] = useState<string | null>(null);
    const [generatedAt, setGeneratedAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const generate = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await commercialIntelligenceApi.aiExecutiveSummary(filter);
            setSummary(result.summary);
            setGeneratedAt(result.generatedAt);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Falha ao gerar o resumo com IA.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card padding="sm" className="border-brand/20 bg-brand/[0.03]">
            <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-brand/15 flex items-center justify-center text-brand shrink-0">
                        <Sparkles className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <h3 className="text-sm font-bold text-ink">Resumo executivo por IA</h3>
                </div>
                <Button variant="outline" size="sm" onClick={() => void generate()} disabled={loading}>
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                    {summary ? 'Gerar de novo' : 'Gerar resumo'}
                </Button>
            </div>

            {error && (
                <p className="flex items-center gap-1.5 text-xs text-[#d03b3b]"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}</p>
            )}

            {!error && summary && (
                <>
                    <p className="text-sm text-ink leading-relaxed whitespace-pre-line">{summary}</p>
                    <p className="text-[10px] text-ink-2 mt-2">
                        Gerado por IA a partir dos números desta tela{generatedAt ? ` em ${new Date(generatedAt).toLocaleString('pt-BR')}` : ''} — pode conter interpretação, não é fonte de dados.
                    </p>
                </>
            )}

            {!error && !summary && (
                <p className="text-xs text-ink-2">
                    Resume em linguagem natural o cockpit acima — usa só os números já calculados nesta tela, nunca inventa valores.
                </p>
            )}
        </Card>
    );
}
