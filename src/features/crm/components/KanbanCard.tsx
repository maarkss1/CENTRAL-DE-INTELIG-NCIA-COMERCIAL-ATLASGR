import React, { useState } from "react";
import { Lead } from '../../../types';
import { IconBuilding, IconUser, IconClock, IconSparkle } from '../../../components/icons';
import { TEMPERATURE_META } from '../constants/leadMeta';

interface KanbanCardProps {
    key?: string;
    lead: Lead;
    onDragStart: (e: React.DragEvent, leadId: string) => void;
    onClick: (lead: Lead) => void;
    onEnrich?: (leadId: string) => Promise<void>;
}

export const KanbanCard = React.memo(function KanbanCard({ lead, onDragStart, onClick, onEnrich }: KanbanCardProps) {
    const [enriching, setEnriching] = useState(false);
    const temperature = lead.temperature ? TEMPERATURE_META[lead.temperature as keyof typeof TEMPERATURE_META] : undefined;

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('leadId', lead.id);
        onDragStart(e, lead.id);
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

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onClick={() => onClick(lead)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(lead); } }}
            className="group cursor-grab rounded-xl border border-black/5 bg-white p-4 elevation-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-atlas-orange/25 hover:elevation-2 active:cursor-grabbing"
        >
            <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="font-semibold text-atlas-dark transition-colors group-hover:text-atlas-orange">
                    {lead.company?.tradeName || lead.company?.legalName || 'Sem Empresa'}
                </h4>
                {lead.score != null && (
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold bg-atlas-orange/10 text-atlas-orange px-2 py-1 rounded-lg">
                        {temperature && <temperature.icon className="w-3 h-3" />}
                        {lead.score}
                    </span>
                )}
            </div>

            <div className="space-y-2 mt-3 text-sm text-atlas-dark/60">
                {lead.contact && (
                    <div className="flex items-center gap-1.5">
                        <IconUser className="w-3.5 h-3.5 text-atlas-dark/35 shrink-0" />
                        <span className="truncate">{lead.contact.name}</span>
                    </div>
                )}
                {lead.company?.segment && (
                    <div className="flex items-center gap-1.5">
                        <IconBuilding className="w-3.5 h-3.5 text-atlas-dark/35 shrink-0" />
                        <span className="truncate">{lead.company.segment}</span>
                    </div>
                )}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-black/5">
                    <div className="flex items-center gap-1.5 text-xs text-atlas-dark/35">
                        <IconClock className="w-3.5 h-3.5" />
                        {new Date(lead.updatedAt || lead.createdAt || '').toLocaleDateString('pt-BR')}
                    </div>
                    {onEnrich && lead.companyId && (
                        <button
                            onClick={handleEnrich}
                            disabled={enriching}
                            title="Reenriquecer com dados da Receita Federal"
                            className="flex items-center gap-1 text-[11px] font-bold text-atlas-orange hover:text-atlas-light-orange disabled:opacity-50 transition-colors"
                        >
                            <IconSparkle className={`w-3 h-3 ${enriching ? 'animate-spin' : ''}`} />
                            {enriching ? 'Enriquecendo...' : 'Enriquecer'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});
