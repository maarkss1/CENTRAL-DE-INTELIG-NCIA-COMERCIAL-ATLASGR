import React, { useState } from "react";
import { Lead } from '../../../types';
import { Building2, User, Calendar, Sparkles, Loader2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TechToolLogo } from '../../../components/ui/TechToolLogo';

const TEMPERATURE_EMOJI: Record<string, string> = { Quente: '🔥', Morno: '🌤️', Frio: '❄️' };

interface KanbanCardProps {
    lead: Lead;
    onClick: (lead: Lead) => void;
    onEnrich?: (leadId: string) => Promise<void>;
}

export const KanbanCard = React.memo(function KanbanCard({ lead, onClick, onEnrich }: KanbanCardProps) {
    const [enriching, setEnriching] = useState(false);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ 
        id: lead.id,
        data: {
            type: 'Lead',
            lead
        }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    };

    const handleEnrich = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!onEnrich || enriching) return;
        setEnriching(true);
        try {
            await onEnrich(lead.id);
        } finally {
            setEnriching(false);
        }
    };

    const companyTech = lead.company?.technologies || [];

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => onClick(lead)}
            className={`bg-surface p-4 rounded-2xl border border-line shadow-md cursor-grab active:cursor-grabbing hover:border-blue-500/50 hover:shadow-xl transition-all group ${isDragging ? 'shadow-2xl ring-2 ring-blue-500 z-50 bg-surface-2' : ''}`}
        >
            <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-ink group-hover:text-blue-400 transition-colors text-sm">
                    {lead.company?.tradeName || lead.company?.legalName || 'Sem Empresa'}
                </h4>
                {lead.score && (
                    <span className="text-xs font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-lg">
                        {lead.temperature ? `${TEMPERATURE_EMOJI[lead.temperature] || ''} ` : ''}{lead.score}
                    </span>
                )}
            </div>

            <div className="space-y-2 mt-2 text-xs text-ink-2">
                {lead.contact && (
                    <div className="flex items-center gap-1.5 text-ink-2">
                        <User className="w-3.5 h-3.5 text-blue-400" />
                        <span className="truncate">{lead.contact.name}</span>
                    </div>
                )}
                {lead.company?.segment && (
                    <div className="flex items-center gap-1.5 text-ink-2">
                        <Building2 className="w-3.5 h-3.5 text-ink-2" />
                        <span className="truncate">{lead.company.segment}</span>
                    </div>
                )}

                {/* Logos das Ferramentas no Card CRM */}
                {companyTech.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                        {companyTech.slice(0, 3).map((tech, i) => (
                            <TechToolLogo key={i} techName={tech} size="sm" />
                        ))}
                    </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-line">
                    <div className="flex items-center gap-1.5 text-[11px] text-ink-2 min-w-0">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        {new Date(lead.updatedAt || lead.createdAt || '').toLocaleDateString('pt-BR')}
                        {lead.owner && <span className="truncate">· {lead.owner}</span>}
                    </div>
                    {onEnrich && lead.companyId && (
                        <button
                            onClick={handleEnrich}
                            disabled={enriching}
                            title="Reenriquecer com dados da Receita Federal"
                            className="flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 disabled:opacity-50 transition-colors pointer-events-auto"
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            {enriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            {enriching ? 'Enriquecendo...' : 'Enriquecer'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});
