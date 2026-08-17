import { useState } from 'react';
import { Sparkles, Loader2, AlertTriangle, ArrowRight } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { commercialIntelligenceApi, type CommercialFilter, type MentorRecommendation, type MentorRecommendationPriority } from '../commercialIntelligence.api';

const PRIORITY_BADGE: Record<MentorRecommendationPriority, { label: string; variant: 'danger' | 'warning' | 'default' }> = {
    alta: { label: 'Prioridade alta', variant: 'danger' },
    media: { label: 'Prioridade média', variant: 'warning' },
    baixa: { label: 'Prioridade baixa', variant: 'default' },
};

/**
 * Mentor Comercial — playbook de recomendações priorizadas (evolução de `AiExecutiveSummaryCard`:
 * em vez de um parágrafo só, uma lista acionável). Geração sempre por clique explícito, nunca ao
 * abrir a aba — mesma regra do resumo executivo (custo real por chamada de IA). `source: 'fallback'`
 * é sinalizado explicitamente ao usuário: nunca apresenta um resultado determinístico como se fosse
 * gerado por IA (ver `CommercialIntelligenceAiService.generateMentorPlaybook`).
 */
export function MentorPlaybookCard({ filter }: { filter: CommercialFilter }) {
    const [recommendations, setRecommendations] = useState<MentorRecommendation[] | null>(null);
    const [source, setSource] = useState<'ai' | 'fallback' | null>(null);
    const [generatedAt, setGeneratedAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const generate = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await commercialIntelligenceApi.aiMentorPlaybook(filter);
            setRecommendations(result.recommendations);
            setSource(result.source);
            setGeneratedAt(result.generatedAt);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Falha ao gerar o playbook com IA.');
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
                    <h3 className="text-sm font-bold text-ink">Mentor Comercial</h3>
                </div>
                <Button variant="outline" size="sm" onClick={() => void generate()} disabled={loading}>
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                    {recommendations ? 'Gerar de novo' : 'Gerar playbook'}
                </Button>
            </div>

            {error && (
                <p className="flex items-center gap-1.5 text-xs text-critical"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}</p>
            )}

            {!error && recommendations && recommendations.length === 0 && (
                <p className="text-xs text-ink-2">Nenhuma prioridade identificada no momento — sem alertas ativos nem negócios com valor relevante em risco.</p>
            )}

            {!error && recommendations && recommendations.length > 0 && (
                <>
                    <ul className="space-y-2">
                        {recommendations.map((rec, i) => {
                            const badge = PRIORITY_BADGE[rec.priority];
                            return (
                                <li key={i} className="rounded-xl border border-line bg-surface p-3">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <p className="text-sm font-bold text-ink">{rec.title}</p>
                                        <Badge variant={badge.variant} className="shrink-0">{badge.label}</Badge>
                                    </div>
                                    <p className="text-xs text-ink-2 mb-1.5">{rec.rationale}</p>
                                    <p className="text-xs font-semibold text-ink flex items-start gap-1.5">
                                        <ArrowRight className="w-3.5 h-3.5 mt-0.5 text-brand shrink-0" aria-hidden="true" />
                                        {rec.suggestedAction}
                                    </p>
                                    {rec.relatedDealIds.length > 0 && (
                                        <p className="text-[10px] text-ink-2 mt-1.5">
                                            {rec.relatedDealIds.length} negócio(s) relacionado(s) — ver no Centro de Decisão abaixo.
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <p className="text-[10px] text-ink-2 mt-2">
                        {source === 'ai'
                            ? `Gerado por IA a partir dos números desta tela${generatedAt ? ` em ${new Date(generatedAt).toLocaleString('pt-BR')}` : ''} — pode conter interpretação, não é fonte de dados.`
                            : `IA indisponível no momento — playbook gerado sem IA, direto dos alertas e negócios em risco já calculados${generatedAt ? ` em ${new Date(generatedAt).toLocaleString('pt-BR')}` : ''}.`}
                    </p>
                </>
            )}

            {!error && !recommendations && (
                <p className="text-xs text-ink-2">
                    Prioriza as próximas ações do mês em ordem de impacto — usa os mesmos números já calculados nesta tela, nunca inventa negócio ou valor.
                </p>
            )}
        </Card>
    );
}
