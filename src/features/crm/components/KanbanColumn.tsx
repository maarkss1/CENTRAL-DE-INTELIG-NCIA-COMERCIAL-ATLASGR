import React from "react";
import { LeadStatus, Lead } from '../../../types';
import { KanbanCard } from './KanbanCard';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';

const STATUS_EMOJI: Record<LeadStatus, string> = {
    'Lead Recebido': '🆕',
    'Cadência Iniciada': '📣',
    'Qualificação (SDR)': '🔎',
    'Reunião Agendada': '📅',
    'Lead Desqualificado': '🚫',
    'Convertido em Oportunidade': '⭐',
    'Nova Oportunidade': '💡',
    'Proposta Enviada': '📄',
    'Call/Visita Agendada': '🤝',
    'Negócios Perdidos': '❌',
    'Negócios Ganhos': '🏆',
};

interface KanbanColumnProps {
    status: LeadStatus;
    leads: Lead[];
    onCardClick: (lead: Lead) => void;
    onCardEnrich?: (leadId: string) => Promise<void>;
}

export const KanbanColumn = React.memo(function KanbanColumn({ status, leads, onCardClick, onCardEnrich }: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({
        id: status,
        data: {
            type: 'Column',
            status
        }
    });

    return (
        <div
            ref={setNodeRef}
            className={`flex flex-col bg-surface rounded-2xl min-w-[320px] max-w-[320px] shrink-0 border transition-colors duration-200 shadow-sm ${isOver ? 'border-blue-400 bg-blue-50/20' : 'border-line'}`}
        >
            <div className="p-4 border-b border-line bg-surface-2/80 rounded-t-2xl sticky top-0 backdrop-blur-sm z-10 flex justify-between items-center">
                <h3 className="font-semibold text-ink-2 flex items-center gap-2">
                    <span>{STATUS_EMOJI[status] || '📌'}</span>
                    {status}
                </h3>
                <span className="bg-surface-2 text-ink-2 text-xs font-medium px-2.5 py-1 rounded-full">
                    {leads.length}
                </span>
            </div>

            <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-[150px] custom-scrollbar">
                <SortableContext items={leads.map(lead => lead.id)} strategy={rectSortingStrategy}>
                    {leads.map(lead => (
                        <KanbanCard
                            key={lead.id}
                            lead={lead}
                            onClick={onCardClick}
                            onEnrich={onCardEnrich}
                        />
                    ))}
                </SortableContext>
                {leads.length === 0 && (
                    <div className="h-full min-h-[100px] border-2 border-dashed border-line rounded-xl flex items-center justify-center text-ink-2 text-sm">
                        📥 Solte cards aqui
                    </div>
                )}
            </div>
        </div>
    );
});

