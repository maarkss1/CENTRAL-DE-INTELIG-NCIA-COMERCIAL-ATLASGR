import { useState, useEffect, useCallback, useMemo } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { Lead, LeadStatus, LeadFunnel, LEAD_FUNNEL_STATUS, DEAL_FUNNEL_STATUS } from '../types';
import { KanbanColumn } from '../features/crm/components/KanbanColumn';
import { KanbanCard } from '../features/crm/components/KanbanCard';
import { LeadDetailDrawer } from '../features/crm/components/LeadDetailDrawer';
import { api } from '../lib/api';
import { leadsDB } from '../lib/db';
import { ContextualTip } from './ui/ContextualTip';
import { EmptyState } from './ui/EmptyState';
import { useBrand } from '../contexts/BrandContext';
import { toast } from '../lib/toast';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay
} from '@dnd-kit/core';

// Dois Kanbans, espelhando os dois objetos do Bitrix24 (Lead x Negócio/Deal) — ver LeadFunnel.
const FUNNEL_COLUMNS: Record<LeadFunnel, LeadStatus[]> = {
    Lead: [...LEAD_FUNNEL_STATUS],
    Negocio: [...DEAL_FUNNEL_STATUS],
};

const FUNNEL_LABEL: Record<LeadFunnel, string> = { Lead: 'Leads', Negocio: 'Negócios' };

// Última etapa do funil de Lead: dropar/clicar aqui não é um "estado de descanso" normal — dispara
// a conversão pra Negócio (mesma transição que o Bitrix24 faz quando um Lead vira Deal).
const CONVERT_TRIGGER_STATUS: LeadStatus = 'Convertido em Oportunidade';
const OPPORTUNITY_ENTRY_STATUS: LeadStatus = 'Nova Oportunidade';

export function CrmBoard() {
    const { brandInfo } = useBrand();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
    const [activeLead, setActiveLead] = useState<Lead | null>(null);
    const [activeFunnel, setActiveFunnel] = useState<LeadFunnel>('Lead');
    const columns = FUNNEL_COLUMNS[activeFunnel];

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor)
    );

    const fetchLeads = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const url = `/api/leads?limit=1000`;
            const response = await api.get<{data: Lead[], meta?: { total: number, page: number, limit: number, totalPages: number }}>(url);

            if (Array.isArray(response)) {
                setLeads(response);
            } else if (response && response.data) {
                setLeads(response.data);
            }
        } catch (err) {
            console.error('Error fetching leads:', err);
            setError(err instanceof Error ? err.message : 'Não foi possível carregar o pipeline comercial.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleDragStart = useCallback((event: any) => {
        const { active } = event;
        const lead = leads.find(l => l.id === active.id);
        if (lead) {
            setActiveLead(lead);
        }
    }, [leads]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleDragEnd = useCallback(async (event: any) => {
        const { active, over } = event;
        setActiveLead(null);

        if (!over) return;

        const leadId = active.id;
        let targetStatus: LeadStatus | null = null;

        if (columns.includes(over.id)) {
            targetStatus = over.id as LeadStatus;
        } else {
            const overLead = leads.find(l => l.id === over.id);
            if (overLead) {
                targetStatus = overLead.status;
            }
        }

        if (!targetStatus) return;

        const currentLead = leads.find(l => l.id === leadId);
        if (currentLead && currentLead.status !== targetStatus) {
            setLeads(prev => prev.map(lead => lead.id === leadId ? { ...lead, status: targetStatus! } : lead));

            try {
                await leadsDB.updateStatus(leadId as string, targetStatus);
            } catch (error) {
                console.error('Error updating lead status:', error);
                fetchLeads();
            }
        }
    }, [leads, columns, fetchLeads]);

    const handleCardClick = useCallback((lead: Lead) => {
        setSelectedLeadId(lead.id);
    }, []);

    // "Converter em Oportunidade" muda de Kanban (funil Lead → Negócio), não só de coluna — por
    // isso é uma ação explícita no card em vez de mais um alvo de drag-and-drop comum.
    const handleConvertToOpportunity = useCallback(async (leadId: string) => {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, funnel: 'Negocio' as LeadFunnel, status: OPPORTUNITY_ENTRY_STATUS } : l));
        try {
            await api.put(`/api/leads/${leadId}`, { status: OPPORTUNITY_ENTRY_STATUS, funnel: 'Negocio' });
            toast.success('Lead convertido em oportunidade — movido para o funil de Negócios.');
        } catch (error) {
            console.error('Error converting lead to opportunity:', error);
            toast.error('Falha ao converter o lead em oportunidade.');
            fetchLeads();
        }
    }, [fetchLeads]);

    const handleCardEnrich = useCallback(async (leadId: string) => {
        try {
            await api.post(`/api/leads/${leadId}/enrich`, undefined, { timeoutMs: 60_000 });
            fetchLeads();
        } catch (error) {
            console.error('Error enriching lead:', error);
            toast.error(error instanceof Error ? error.message : 'Falha ao enriquecer o lead.');
        }
    }, [fetchLeads]);

    const handleExportCsv = () => {
        const headers = ['ID', 'Empresa', 'CNPJ', 'Contato', 'Email', 'Telefone', 'Status', 'Pontuacao'];
        const rows = leads.map(l => [
            l.id,
            l.company?.tradeName || l.company?.legalName || '',
            l.company?.cnpj || '',
            l.contact?.name || '',
            l.contact?.email || '',
            l.contact?.phone || '',
            l.status,
            l.score || ''
        ]);
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `leads_${brandInfo.name.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const groupedLeads = useMemo(() => {
        const grouped = Object.fromEntries(columns.map(status => [status, [] as Lead[]])) as Record<LeadStatus, Lead[]>;
        leads.forEach(lead => {
            if (lead.funnel === activeFunnel && grouped[lead.status]) {
                grouped[lead.status].push(lead);
            }
        });
        return grouped;
    }, [leads, columns, activeFunnel]);

    const funnelCounts = useMemo(() => {
        const counts: Record<LeadFunnel, number> = { Lead: 0, Negocio: 0 };
        leads.forEach(lead => { counts[lead.funnel] = (counts[lead.funnel] || 0) + 1; });
        return counts;
    }, [leads]);

    return (
        <div className="flex-1 flex flex-col h-full bg-bg text-ink animate-in fade-in duration-500 overflow-hidden">
            {/* Header com estilo moderno */}
            <div className="p-6 border-b border-line flex flex-col sm:flex-row items-start sm:items-center justify-between bg-bg/90 backdrop-blur-xl shrink-0 gap-4">
                <div>
                    <h2 className="font-extrabold text-2xl text-ink tracking-tight flex items-center gap-2">
                        🎯 {brandInfo.name} Sales Cloud (Pipeline CRM)
                    </h2>
                    <p className="text-ink-2 text-xs mt-1">Arraste os cards para avançar no funil comercial e veja as ferramentas mapeadas em cada conta</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => toast.info('Importação direta do Bitrix24 ainda não está disponível — chegando em breve.')}
                        className="flex items-center gap-2 bg-surface-2 border border-line text-ink-2 px-4 py-2 rounded-xl font-bold text-xs hover:bg-surface transition-colors"
                        title="Importar leads do Bitrix24 (em breve)"
                    >
                        <Download className="w-4 h-4 rotate-180 text-blue-400" /> 📥 Importar do Bitrix24 (em breve)
                    </button>
                    <button
                        onClick={handleExportCsv}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-xs transition-colors shadow-md"
                        title="Exportar todos os leads para uma planilha CSV"
                    >
                        <Download className="w-4 h-4" /> 💾 Exportar CSV
                    </button>
                </div>
            </div>

            {/* Contextual Tip Banner */}
            <div className="px-6 pt-4 shrink-0">
                <ContextualTip
                    id="tip-crm-pipeline"
                    title="💡 Dica de Gestão de Funil CRM"
                    description="Passe o cursor sobre os cards para ver as ferramentas da empresa e o score de engajamento antes de agendar a próxima call comercial!"
                />
            </div>

            {/* Tabs: funil de Leads (pré-qualificação) x funil de Negócios (pipeline comercial real) */}
            <div className="px-6 pt-4 shrink-0">
                <div className="flex gap-1 p-1 bg-surface-2 rounded-lg w-fit">
                    {(['Lead', 'Negocio'] as LeadFunnel[]).map(funnel => (
                        <button
                            key={funnel}
                            onClick={() => setActiveFunnel(funnel)}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${activeFunnel === funnel ? 'bg-surface text-blue-500 shadow-sm' : 'text-ink-2 hover:text-ink'}`}
                        >
                            {FUNNEL_LABEL[funnel]} ({funnelCounts[funnel]})
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 custom-scrollbar bg-surface-2/50">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-ink-2 font-medium text-sm">Carregando pipeline comercial...</p>
                        </div>
                    </div>
                ) : error ? (
                    <EmptyState
                        icon={<WifiOff className="w-8 h-8 text-atlas-orange" />}
                        title="Não foi possível carregar o pipeline"
                        description={error}
                        actionLabel="Tentar novamente"
                        onAction={fetchLeads}
                    />
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        <div className="flex gap-6 h-full items-start">
                            {columns.map(status => (
                                <KanbanColumn
                                    key={status}
                                    status={status}
                                    leads={groupedLeads[status]}
                                    onCardClick={handleCardClick}
                                    onCardEnrich={handleCardEnrich}
                                    onCardConvert={activeFunnel === 'Lead' && status === CONVERT_TRIGGER_STATUS ? handleConvertToOpportunity : undefined}
                                />
                            ))}
                        </div>
                        <DragOverlay>
                            {activeLead ? (
                                <div className="w-[320px] rotate-2 scale-[1.03] opacity-95 shadow-2xl pointer-events-none">
                                    <KanbanCard lead={activeLead} onClick={() => {}} />
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                )}
            </div>

            {selectedLeadId && (
                <LeadDetailDrawer
                    leadId={selectedLeadId}
                    onClose={() => setSelectedLeadId(null)}
                    onChanged={fetchLeads}
                />
            )}
        </div>
    );
}
