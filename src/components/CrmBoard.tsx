import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Lead, LeadStatus } from '../types';
import { KanbanColumn } from '../features/crm/components/KanbanColumn';
import { LeadDetailDrawer } from '../features/crm/components/LeadDetailDrawer';
import { api } from '../lib/api';
import { Button } from './ui/Button';
import { IconPipeline, IconDownload, IconSpinner, IconFilter } from './icons';
import { fadeInUp } from '../lib/motion';

const COLUMNS: LeadStatus[] = [
    'Novo Lead',
    'Qualificação',
    'Primeiro Contato',
    'Diagnóstico',
    'Proposta',
    'Negociação',
    'Fechado Ganho',
    'Fechado Perdido'
];

const ANOS_FILTER = ['Todos', '2025', '2026'];
const MESES_FILTER = [
    'Todos', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function CrmBoard() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
    const [selectedAno, setSelectedAno] = useState('Todos');
    const [selectedMes, setSelectedMes] = useState('Todos');

    const fetchLeads = useCallback(async () => {
        setLoading(true);
        try {
            const url = `/api/leads?limit=1000`;
            const response = await api.get<{ data: Lead[] }>(url);

            if (Array.isArray(response)) {
                setLeads(response);
            } else if (response && response.data) {
                setLeads(response.data);
            }
        } catch (error) {
            console.error('Error fetching leads:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    const handleDragStart = useCallback((e: React.DragEvent, leadId: string) => {
        e.dataTransfer.setData('leadId', leadId);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent, status: LeadStatus) => {
        e.preventDefault();
        const leadId = e.dataTransfer.getData('leadId');
        if (!leadId) return;

        setLeads(prev => prev.map(lead => lead.id === leadId ? { ...lead, status } : lead));

        try {
            await api.put(`/api/leads/${leadId}`, { status });
        } catch (error) {
            console.error('Error updating lead status:', error);
            fetchLeads();
        }
    }, [fetchLeads]);

    const handleCardClick = useCallback((lead: Lead) => {
        setSelectedLeadId(lead.id);
    }, []);

    const handleCardEnrich = useCallback(async (leadId: string) => {
        try {
            const result = await api.post<{ lead: Lead }>(`/api/leads/${leadId}/enrich`);
            setLeads(prev => prev.map(lead => lead.id === leadId ? result.lead : lead));
        } catch (error) {
            console.error('Error enriching lead:', error);
        }
    }, []);

    const handleExportCsv = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/leads/export/csv', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) throw new Error('Falha ao exportar leads');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `leads-atlasgr-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting leads:', error);
        }
    }, []);

    // Filter leads by selected Year & Month
    const filteredLeads = useMemo(() => {
        return leads.filter(lead => {
            if (!lead.createdAt) return true;
            const date = new Date(lead.createdAt);
            const yearStr = date.getFullYear().toString();
            const monthIdx = date.getMonth(); // 0 = Jan, 1 = Fev...
            const monthStr = MESES_FILTER[monthIdx + 1];

            const matchAno = selectedAno === 'Todos' || yearStr === selectedAno;
            const matchMes = selectedMes === 'Todos' || monthStr === selectedMes;

            return matchAno && matchMes;
        });
    }, [leads, selectedAno, selectedMes]);

    const groupedLeads = useMemo(() => {
        const grouped = {} as Record<LeadStatus, Lead[]>;
        COLUMNS.forEach(status => grouped[status] = []);
        filteredLeads.forEach(lead => {
            if (grouped[lead.status]) {
                grouped[lead.status].push(lead);
            }
        });
        return grouped;
    }, [filteredLeads]);

    return (
        <div className="flex-1 flex flex-col h-full bg-gray-50/50 overflow-hidden">
            {/* Header */}
            <motion.div
                variants={fadeInUp}
                initial="hidden"
                animate="show"
                className="p-6 border-b border-black/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel shrink-0"
            >
                <div>
                    <h2 className="font-black text-2xl text-atlas-dark flex items-center gap-2.5">
                        <IconPipeline className="w-6 h-6 text-orange-600" />
                        AtlasGR Sales Cloud
                    </h2>
                    <p className="text-atlas-dark/50 text-xs mt-0.5">Pipeline de negociações e gestão de oportunidades de risco e telemetria</p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {/* Filtros Globais de Ano e Mês (Plano 07) */}
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-black/10 text-xs font-bold text-atlas-dark">
                        <IconFilter className="w-3.5 h-3.5 text-orange-600" />
                        <span>Ano:</span>
                        <select
                            value={selectedAno}
                            onChange={e => setSelectedAno(e.target.value)}
                            className="bg-transparent outline-none cursor-pointer text-orange-600"
                        >
                            {ANOS_FILTER.map(ano => (
                                <option key={ano} value={ano}>{ano}</option>
                            ))}
                        </select>
                        <span className="text-black/20">|</span>
                        <span>Mês:</span>
                        <select
                            value={selectedMes}
                            onChange={e => setSelectedMes(e.target.value)}
                            className="bg-transparent outline-none cursor-pointer text-orange-600"
                        >
                            {MESES_FILTER.map(mes => (
                                <option key={mes} value={mes}>{mes}</option>
                            ))}
                        </select>
                    </div>

                    <Button variant="glass" onClick={handleExportCsv} title="Exportar leads no formato Bitrix24/AtlasGR">
                        <IconDownload className="w-4 h-4 mr-2" /> Exportar CSV
                    </Button>
                </div>
            </motion.div>

            {/* Kanban columns */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <IconSpinner className="w-8 h-8 text-orange-600 animate-spin" />
                            <p className="text-atlas-dark/50 font-medium">Carregando AtlasGR Sales Cloud...</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-6 h-full items-start">
                        {COLUMNS.map(status => (
                            <KanbanColumn
                                key={status}
                                status={status}
                                leads={groupedLeads[status]}
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onCardDragStart={handleDragStart}
                                onCardClick={handleCardClick}
                                onCardEnrich={handleCardEnrich}
                            />
                        ))}
                    </div>
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
