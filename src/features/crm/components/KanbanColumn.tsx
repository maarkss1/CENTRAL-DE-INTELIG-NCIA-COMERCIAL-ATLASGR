import React from "react";
import { motion } from 'motion/react';
import { LeadStatus, Lead } from '../../../types';
import { KanbanCard } from './KanbanCard';
import {
    IconSparkle,
    IconSearch,
    IconPhone,
    IconActivity,
    IconDocument,
    IconHandshake,
    IconTrophy,
    IconClose,
    type AtlasIconProps,
} from '../../../components/icons';
import { staggerContainer, staggerItem } from '../../../lib/motion';

const STATUS_META: Record<LeadStatus, { icon: React.ComponentType<AtlasIconProps>; accent: string; dot: string }> = {
    'Novo Lead': { icon: IconSparkle, accent: 'text-blue-600', dot: 'bg-blue-500' },
    'Qualificação': { icon: IconSearch, accent: 'text-indigo-600', dot: 'bg-indigo-500' },
    'Primeiro Contato': { icon: IconPhone, accent: 'text-violet-600', dot: 'bg-violet-500' },
    'Diagnóstico': { icon: IconActivity, accent: 'text-amber-600', dot: 'bg-amber-500' },
    'Proposta': { icon: IconDocument, accent: 'text-cyan-600', dot: 'bg-cyan-500' },
    'Negociação': { icon: IconHandshake, accent: 'text-atlas-orange', dot: 'bg-atlas-orange' },
    'Fechado Ganho': { icon: IconTrophy, accent: 'text-green-600', dot: 'bg-green-500' },
    'Fechado Perdido': { icon: IconClose, accent: 'text-red-500', dot: 'bg-red-400' },
};

interface KanbanColumnProps {
    key?: string;
    status: LeadStatus;
    leads: Lead[];
    onDrop: (e: React.DragEvent, status: LeadStatus) => void;
    onDragOver: (e: React.DragEvent) => void;
    onCardDragStart: (e: React.DragEvent, leadId: string) => void;
    onCardClick: (lead: Lead) => void;
    onCardEnrich?: (leadId: string) => Promise<void>;
}

export const KanbanColumn = React.memo(function KanbanColumn({ status, leads, onDrop, onDragOver, onCardDragStart, onCardClick, onCardEnrich }: KanbanColumnProps) {
    const [isDragOver, setIsDragOver] = React.useState(false);
    const meta = STATUS_META[status];

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        onDrop(e, status);
    };

    return (
        <div
            className={`flex flex-col glass-panel rounded-2xl min-w-[320px] max-w-[320px] shrink-0 elevation-1 transition-shadow duration-200 ${isDragOver ? 'ring-2 ring-atlas-orange/40 elevation-2' : ''}`}
            onDrop={handleDrop}
            onDragOver={(e) => { onDragOver(e); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
        >
            <div className="p-4 border-b border-black/5 sticky top-0 z-10 flex justify-between items-center">
                <h3 className={`font-bold text-sm flex items-center gap-2 ${meta.accent}`}>
                    <meta.icon className="w-4 h-4" />
                    <span className="text-atlas-dark/80">{status}</span>
                </h3>
                <span className="bg-black/5 text-atlas-dark/60 text-xs font-bold px-2.5 py-1 rounded-full tabular-nums">
                    {leads.length}
                </span>
            </div>

            <motion.div
                variants={staggerContainer(0.04)}
                initial="hidden"
                animate="show"
                className="p-3 flex-1 overflow-y-auto space-y-3 min-h-[150px]"
            >
                {leads.map(lead => (
                    <motion.div key={lead.id} variants={staggerItem}>
                        <KanbanCard
                            lead={lead}
                            onDragStart={onCardDragStart}
                            onClick={onCardClick}
                            onEnrich={onCardEnrich}
                        />
                    </motion.div>
                ))}
                {leads.length === 0 && (
                    <div className={`h-full min-h-[100px] border-2 border-dashed rounded-xl flex items-center justify-center text-xs font-medium transition-colors ${isDragOver ? 'border-atlas-orange/50 text-atlas-orange bg-atlas-orange/5' : 'border-black/10 text-atlas-dark/30'}`}>
                        Solte cards aqui
                    </div>
                )}
            </motion.div>
        </div>
    );
});
