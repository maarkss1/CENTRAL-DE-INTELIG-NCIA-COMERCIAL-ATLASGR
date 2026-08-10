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
    'Piloto VTECH': '🧪',
    'Piloto Atlas Profile': '🧪',
    'Piloto Atlas Profile - Concluído': '✅',
    'Piloto Atlas Profile - Cancelado': '⛔',
    'Piloto Logística': '🚚',
    'Piloto Logístico - Concluído': '✅',
    'Piloto Logístico - Cancelado': '⛔',
    'Negócios Perdidos': '❌',
    'Negócios Ganhos': '🏆',
};

interface KanbanColumnProps {
    status: LeadStatus;
    leads: Lead[];
    onCardClick: (lead: Lead) => void;
    onCardEnrich?: (leadId: string) => Promise<void>;
    onConvert?: (leadId: string) => Promise<void>;
}

export const KanbanColumn = React.memo(function KanbanColumn({ status, leads, onCardClick, onCardEnrich, onConvert }: KanbanColumnProps) {
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
            // border-brand sozinho falha o mínimo de contraste não-textual (3:1) da Total Trac em
            // dark mode: --brand da Total Trac é #374898 (navy), só 2.25:1 contra a superfície
            // escura (#171211) — confirmado via cálculo real, não "parece diferente" (ver matriz
            // no relato da Rodada B). dark:border-brand-2 troca pro azul de acento mais claro
            // (#008FCE) só no tema escuro, que dá 5.15:1 — a AtlasGR também passa nos dois casos.
            className={`flex flex-col bg-surface rounded-2xl min-w-[320px] max-w-[320px] shrink-0 border transition-colors duration-200 shadow-sm ${isOver ? 'border-brand dark:border-brand-2 bg-soft' : 'border-line'}`}
        >
            {/* h3 sem tamanho explícito herdava o font-size:2rem global (@layer base em
                globals.css) — o emoji, no mesmo elemento, ficava do mesmo tamanho gigante e
                competia com o título. text-sm restaura a escala de rótulo de coluna; o emoji vira
                aria-hidden (a informação da etapa já está no texto) e ganha peso visual secundário
                (menor + opacidade reduzida) em vez de dividir a atenção com o título. */}
            <div className="p-4 border-b border-line bg-surface-2/80 rounded-t-2xl sticky top-0 backdrop-blur-sm z-10 flex justify-between items-center gap-2">
                <h3 className="text-sm font-bold text-ink-2 flex items-center gap-1.5 min-w-0">
                    <span className="text-xs opacity-60 shrink-0" aria-hidden="true">{STATUS_EMOJI[status] || '📌'}</span>
                    <span className="line-clamp-2 leading-tight">{status}</span>
                </h3>
                <span className="bg-surface-2 text-ink-2 text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
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
                            onConvert={onConvert}
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

