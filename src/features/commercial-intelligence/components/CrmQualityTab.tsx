import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Link2, Link2Off, RefreshCw, Loader2, PlugZap, Zap } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Button } from '../../../components/ui/Button';
import { BitrixImportPanel } from '../../integrations/components/BitrixImportPanel';
import { BitrixSyncRulesPanel } from '../../integrations/components/BitrixSyncRulesPanel';
import { useBitrixIntegration } from '../../../hooks/useBitrixIntegration';
import { toast } from '../../../lib/toast';
import { api } from '../../../lib/api';
import { KpiTile } from './KpiTile';
import { commercialIntelligenceApi, formatPercent, type CommercialFilter, type CrmQualityIndex, type DataReadinessScore } from '../commercialIntelligence.api';

const IMPACT_LABEL: Record<'alto' | 'medio' | 'baixo', string> = { alto: 'Alto impacto', medio: 'Impacto médio', baixo: 'Baixo impacto' };
const CLASSIFICATION_STYLE: Record<'saudavel' | 'atencao' | 'critico', string> = {
    saudavel: 'text-[#0ca30c] bg-[#0ca30c]/70',
    atencao: 'text-[#b8860b] bg-[#b8860b]/70',
    critico: 'text-critical bg-critical/70',
};

/** "Confiabilidade dos Dados" (seção 5) — completude PONDERADA por impacto no forecast, distinta da completude bruta por campo abaixo. */
function DataReadinessCard({ data }: { data: DataReadinessScore }) {
    return (
        <Card padding="sm">
            <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-ink">Confiabilidade dos Dados</h3>
                <span className={`text-lg font-black [font-variant-numeric:tabular-nums] ${data.classification === 'saudavel' ? 'text-[#0ca30c]' : data.classification === 'critico' ? 'text-critical' : data.classification === 'atencao' ? 'text-[#b8860b]' : 'text-ink'}`}>
                    {formatPercent(data.overallScore)}
                </span>
            </div>
            <p className="text-[11px] text-ink-2 mb-3">Média ponderada por impacto real no Forecast — não é uma média simples de preenchimento (ver dicionário de métricas).</p>
            <div className="space-y-2">
                {data.fields.map((field) => (
                    <div key={field.field} className="flex items-center gap-3">
                        <div className="w-40 shrink-0">
                            <p className="text-xs font-semibold text-ink">{field.label}</p>
                            <p className="text-[10px] text-ink-2">{IMPACT_LABEL[field.forecastImpact]}</p>
                        </div>
                        <div className="flex-1 h-5 rounded-md bg-surface-2 overflow-hidden">
                            <div
                                className={`h-full rounded-md ${field.classification ? CLASSIFICATION_STYLE[field.classification] : 'bg-line'}`}
                                style={{ width: `${field.completeness ?? 0}%` }}
                            />
                        </div>
                        <div className="w-28 shrink-0 text-right text-[11px] text-ink-2 [font-variant-numeric:tabular-nums]">
                            {formatPercent(field.completeness)} ({field.filled}/{field.total})
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

/** Card de saúde da sincronização Bitrix24 — separado da completude de campos porque mede uma coisa diferente: vínculo/integração, não preenchimento de dado local. */
function BitrixSyncCard({ data }: { data: CrmQualityIndex['bitrixSync'] }) {
    const navigate = useNavigate();
    const [retrying, setRetrying] = useState<string | null>(null);

    const retry = async (leadId: string) => {
        setRetrying(leadId);
        try {
            await api.post('/api/leads/export/bitrix24', { leadId });
            toast.success('Reenviado ao Bitrix24 com sucesso.');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Falha ao reenviar ao Bitrix24.');
        } finally {
            setRetrying(null);
        }
    };

    if (!data.connected) {
        return (
            <EmptyState
                icon={<PlugZap className="w-8 h-8 text-brand" />}
                title="Bitrix24 não conectado"
                description="Conecte um portal Bitrix24 em Integrações para acompanhar aqui o vínculo e a saúde de sincronização dos negócios."
                actionLabel="Ir para Integrações"
                onAction={() => navigate('/app/integrations')}
            />
        );
    }

    return (
        <Card padding="sm">
            <h3 className="text-sm font-bold text-ink mb-3">Sincronização com Bitrix24 ({data.totalOpen} negócio(s) abertos)</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <KpiTile label="Vinculados ao Bitrix" value={formatPercent(data.linkedRate)} tone={data.linkedRate != null && data.linkedRate >= 80 ? 'good' : data.linkedRate != null && data.linkedRate < 50 ? 'critical' : undefined} metricKey="bitrix_sincronizacao" />
                <KpiTile label="Sem vínculo" value={String(data.notLinked)} tone={data.notLinked > 0 ? undefined : 'good'} />
                <KpiTile label="Falha na última sincronização" value={String(data.failed)} tone={data.failed > 0 ? 'critical' : 'good'} />
                <KpiTile label="Última sincronização" value={data.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString('pt-BR') : 'Nunca sincronizado'} />
                <KpiTile label="Sincronizados (30 dias)" value={String(data.syncedCount30d)} tone="good" />
                <KpiTile label="Falhas (30 dias)" value={String(data.failedCount30d)} tone={data.failedCount30d > 0 ? 'critical' : 'good'} />
            </div>

            {data.failures.length > 0 && (
                <div className="space-y-1.5 pt-3 border-t border-line">
                    <p className="text-xs font-bold text-ink-2 uppercase tracking-wide mb-1">Falhas recentes</p>
                    {data.failures.map((f) => (
                        <div key={f.leadId} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 border border-line px-3 py-2">
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-ink truncate">{f.title || f.companyName || 'Negócio sem título'}</p>
                                <p className="text-[11px] text-critical truncate">{f.error || 'Erro não especificado'}</p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                className="shrink-0 h-7 px-2 text-[11px]"
                                disabled={retrying === f.leadId}
                                onClick={() => retry(f.leadId)}
                            >
                                {retrying === f.leadId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                Tentar novamente
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

export function CrmQualityTab({ filter }: { filter: CommercialFilter }) {
    const [data, setData] = useState<CrmQualityIndex | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { bitrixConnections, selectedBitrixConnectionId } = useBitrixIntegration();

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        commercialIntelligenceApi
            .crmQuality(filter)
            .then((result) => !cancelled && setData(result))
            .catch((err) => !cancelled && setError((err as Error).message))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [filter]);

    if (loading) return <Skeleton className="h-64 rounded-2xl" />;
    if (error) return <div className="flex items-center gap-2 text-sm text-critical py-6"><AlertTriangle className="w-4 h-4" /> {error}</div>;
    if (!data) return null;

    return (
        <div className="space-y-6">
            {data.evaluatedCount === 0 ? (
                <EmptyState title="Nenhum negócio aberto para avaliar" description="A qualidade do CRM é medida sobre os negócios abertos do funil Negócio." />
            ) : (
                <>
                    <DataReadinessCard data={data.dataReadiness} />

                    <div className="grid grid-cols-2 gap-3">
                        <KpiTile label="Índice geral de completude" value={formatPercent(data.overallScore)} tone={data.overallScore != null && data.overallScore >= 80 ? 'good' : data.overallScore != null && data.overallScore < 50 ? 'critical' : undefined} metricKey="qualidade_crm" />
                        <KpiTile label="Grupos com duplicidade suspeita" value={String(data.suspectedDuplicateGroups)} tone={data.suspectedDuplicateGroups > 0 ? 'critical' : 'good'} />
                    </div>

                    <Card padding="sm">
                        <h3 className="text-sm font-bold text-ink mb-3">Completude por campo ({data.evaluatedCount} negócio(s) abertos avaliados)</h3>
                        <div className="space-y-2">
                            {data.fields.map((field) => (
                                <div key={field.field} className="flex items-center gap-3">
                                    <div className="w-32 shrink-0 text-xs font-semibold text-ink">{field.label}</div>
                                    <div className="flex-1 h-5 rounded-md bg-surface-2 overflow-hidden">
                                        <div
                                            className={`h-full rounded-md ${field.completeness != null && field.completeness >= 80 ? 'bg-[#0ca30c]/70' : field.completeness != null && field.completeness < 50 ? 'bg-critical/70' : 'bg-brand/70'}`}
                                            style={{ width: `${field.completeness ?? 0}%` }}
                                        />
                                    </div>
                                    <div className="w-28 shrink-0 text-right text-[11px] text-ink-2 [font-variant-numeric:tabular-nums]">
                                        {formatPercent(field.completeness)} ({field.filled}/{field.total})
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </>
            )}

            <BitrixSyncCard data={data.bitrixSync} />

            {data.bitrixSync.connected && selectedBitrixConnectionId && (
                <Card padding="sm">
                    <div className="flex items-center gap-2 mb-1">
                        <Zap className="w-4 h-4 text-brand" />
                        <h3 className="text-sm font-bold text-ink">Integração automática com o Bitrix24</h3>
                    </div>
                    <p className="text-xs text-ink-2 mb-1">
                        Defina uma regra por pipeline/etapa/vendedor uma única vez — o Atlas verifica a cada 15 minutos e traz sozinho os negócios que baterem, sem precisar buscar manualmente toda vez. O Comercial Inteligente sempre calcula sobre o mês selecionado no filtro no topo da página, então assim que um negócio entra por aqui ele já aparece no mês vigente (ou no mês em que a data dele cair) sem nenhum passo extra.
                    </p>
                    <BitrixSyncRulesPanel connectionId={selectedBitrixConnectionId} />
                </Card>
            )}

            {data.bitrixSync.connected && selectedBitrixConnectionId && (
                <Card padding="sm">
                    <div className="flex items-center gap-2 mb-1">
                        {data.bitrixSync.notLinked > 0 ? <Link2Off className="w-4 h-4 text-[#b8860b]" /> : <Link2 className="w-4 h-4 text-[#0ca30c]" />}
                        <h3 className="text-sm font-bold text-ink">Buscar e importar manualmente</h3>
                    </div>
                    <p className="text-xs text-ink-2 mb-1">
                        Para trazer algo pontual sem esperar o próximo ciclo automático, ou negócios fora do escopo de qualquer regra ativa.
                    </p>
                    <BitrixImportPanel connectionId={selectedBitrixConnectionId} />
                </Card>
            )}
            {data.bitrixSync.connected && bitrixConnections.length === 0 && (
                <Skeleton className="h-24 rounded-2xl" />
            )}
        </div>
    );
}
