import { useState, useEffect, useCallback, useMemo } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { Lead, LeadStatus } from '../types';
import { KanbanColumn } from '../features/crm/components/KanbanColumn';
import { KanbanCard } from '../features/crm/components/KanbanCard';
import { LeadDetailDrawer } from '../features/crm/components/LeadDetailDrawer';
import { api } from '../lib/api';
import { leadsDB } from '../lib/db';
import { ContextualTip } from './ui/ContextualTip';
import { EmptyState } from './ui/EmptyState';
import { useBrand } from '../contexts/BrandContext';
import { toast } from '../lib/toast';
import { clientLogger } from '../lib/clientLogger';
import { 
    DndContext, 
    closestCenter, 
    KeyboardSensor, 
    PointerSensor, 
    useSensor, 
    useSensors, 
    DragOverlay,
    DragStartEvent,
    DragEndEvent
} from '@dnd-kit/core';

const COLUMNS: LeadStatus[] = [
    'Lead Recebido',
    'Cadência Iniciada',
    'Qualificação (SDR)',
    'Reunião Agendada',
    'Lead Desqualificado',
    'Convertido em Oportunidade',
    'Nova Oportunidade',
    'Proposta Enviada',
    'Call/Visita Agendada',
    'Negócios Perdidos',
    'Negócios Ganhos'
];

export function CrmBoard() {
    const { brandInfo } = useBrand();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
    const [activeLead, setActiveLead] = useState<Lead | null>(null);

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
            clientLogger.error({ err }, 'Error fetching leads');
            setError(err instanceof Error ? err.message : 'Não foi possível carregar o pipeline comercial.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const { active } = event;
        const lead = leads.find(l => l.id === active.id);
        if (lead) {
            setActiveLead(lead);
        }
    }, [leads]);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveLead(null);

        if (!over) return;

        const leadId = active.id;
        let targetStatus: LeadStatus | null = null;

        if (typeof over.id === 'string' && COLUMNS.includes(over.id as LeadStatus)) {
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
                clientLogger.error({ err: error }, 'Error updating lead status');
                fetchLeads();
            }
        }
    }, [leads, fetchLeads]);

    const handleCardClick = useCallback((lead: Lead) => {
        setSelectedLeadId(lead.id);
    }, []);

    const handleCardEnrich = useCallback(async (leadId: string) => {
        try {
            await api.post(`/api/leads/${leadId}/enrich`, undefined, { timeoutMs: 60_000 });
            await fetchLeads();
            toast.success('Lead enriquecido com sucesso.');
        } catch (error) {
            clientLogger.error({ err: error }, 'Error enriching lead');
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
        const grouped: Record<LeadStatus, Lead[]> = {
            'Lead Recebido': [],
            'Cadência Iniciada': [],
            'Qualificação (SDR)': [],
            'Reunião Agendada': [],
            'Lead Desqualificado': [],
            'Convertido em Oportunidade': [],
            'Nova Oportunidade': [],
            'Proposta Enviada': [],
            'Call/Visita Agendada': [],
            'Negócios Perdidos': [],
            'Negócios Ganhos': []
        };
        leads.forEach(lead => {
            if (grouped[lead.status]) {
                grouped[lead.status].push(lead);
            }
        });
        return grouped;
    }, [leads]);

    const handleImportBitrix = async () => {
        setLoading(true);
        try {
            const response = await api.post<{ data: { imported: number, skipped: number } }>('/api/leads/import/bitrix24');
            const data = response.data;
            if (data.imported > 0) {
                toast.success(`${data.imported} novos leads importados do Bitrix24!`);
                await fetchLeads();
            } else if (data.skipped > 0) {
                toast.info(`Nenhum novo lead. ${data.skipped} leads recentes já estavam no sistema.`);
            } else {
                toast.info('Nenhum lead novo encontrado no Bitrix24.');
            }
        } catch (err) {
            console.error('Error importing from Bitrix24:', err);
            toast.error(err instanceof Error ? err.message : 'Falha ao importar do Bitrix24.');
        } finally {
            setLoading(false);
        }
    };

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
                        onClick={handleImportBitrix}
                        disabled={loading}
                        className="flex items-center gap-2 bg-surface-2 border border-line text-ink-2 px-4 py-2 rounded-xl font-bold text-xs hover:bg-surface transition-colors disabled:opacity-50"
                        title="Importar leads recentes do Bitrix24"
                    >
                        <Download className="w-4 h-4 rotate-180 text-blue-400" /> 📥 {loading ? 'Importando...' : 'Sincronizar Bitrix24'}
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
                            {COLUMNS.map(status => (
                                <KanbanColumn
                                    key={status}
                                    status={status}
                                    leads={groupedLeads[status]}
                                    onCardClick={handleCardClick}
                                    onCardEnrich={handleCardEnrich}
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
