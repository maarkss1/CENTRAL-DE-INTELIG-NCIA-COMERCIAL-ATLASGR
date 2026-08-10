import React, { useState, useRef, useEffect } from "react";
import { Lead } from '../../../types';
import { Building2, User, Calendar, Sparkles, Loader2, ArrowRightCircle } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TechToolLogo } from '../../../components/ui/TechToolLogo';

const TEMPERATURE_EMOJI: Record<string, string> = { Quente: '🔥', Morno: '🌤️', Frio: '❄️' };

interface KanbanCardProps {
    lead: Lead;
    onClick: (lead: Lead) => void;
    onEnrich?: (leadId: string) => Promise<void>;
    /** Só passado na coluna "Convertido em Oportunidade" — move o card pro funil de Negócios. */
    onConvert?: (leadId: string) => Promise<void>;
}

export const KanbanCard = React.memo(function KanbanCard({ lead, onClick, onEnrich, onConvert }: KanbanCardProps) {
    const [enriching, setEnriching] = useState(false);
    const [converting, setConverting] = useState(false);
    const techRowRef = useRef<HTMLDivElement>(null);

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

    const companyTech = lead.company?.technologies || [];

    // TechToolLogo (fora do escopo de edição desta rodada) sempre renderiza um <button> real,
    // mesmo sem onClick. Aqui os logos são puramente informativos, então ficam fora do Tab/da
    // árvore de acessibilidade pra não sobrar preso dentro do role="button" do card
    // (nested-interactive confirmado pelo axe-core). O nome das tecnologias continua disponível
    // pra leitor de tela via texto sr-only logo abaixo, pra não perder a informação.
    useEffect(() => {
        const buttons = techRowRef.current?.querySelectorAll('button');
        buttons?.forEach((btn) => {
            btn.tabIndex = -1;
        });
    }, [companyTech.length]);

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

    const handleConvert = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!onConvert || converting) return;
        setConverting(true);
        try {
            await onConvert(lead.id);
        } finally {
            setConverting(false);
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`bg-surface rounded-2xl border border-line shadow-md hover:border-blue-500/50 hover:shadow-xl transition-all group ${isDragging ? 'shadow-2xl ring-2 ring-blue-500 z-50 bg-surface-2' : ''}`}
        >
            {/* Região arrastável/clicável — role="button" e o keydown do dnd-kit vêm de
                attributes/listeners. Os botões de ação (abaixo) ficam FORA desta div de propósito:
                um controle interativo real dentro de um elemento role="button" é nested-interactive
                (violação confirmada pelo axe-core), e o dnd-kit precisa que pointer+teclado do drag
                fiquem no mesmo nó pra preservar "arrastar segurando em qualquer parte do card" — não
                dá pra isolar um drag handle sem mudar esse comportamento de mouse. Ver relato da
                Rodada A pra essa limitação estrutural do dnd-kit. */}
            <div
                {...attributes}
                {...listeners}
                onClick={() => onClick(lead)}
                className="p-4 pb-0 cursor-grab active:cursor-grabbing"
            >
                <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-ink group-hover:text-blue-400 transition-colors text-sm">
                        {lead.company?.tradeName || lead.company?.legalName || 'Sem Empresa'}
                    </h4>
                    {lead.score && (
                        <span className="text-xs font-extrabold bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-lg">
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

                    {/* Logos das Ferramentas no Card CRM — meramente informativos aqui, não entram
                        no Tab (ver useEffect acima); o nome de cada tecnologia segue acessível via
                        o span sr-only logo abaixo. */}
                    {companyTech.length > 0 && (
                        <>
                            <div ref={techRowRef} aria-hidden="true" className="flex flex-wrap gap-1 pt-1">
                                {companyTech.slice(0, 3).map((tech, i) => (
                                    <TechToolLogo key={i} techName={tech} size="sm" />
                                ))}
                            </div>
                            <span className="sr-only">Tecnologias detectadas: {companyTech.slice(0, 3).join(', ')}</span>
                        </>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between mx-4 mb-4 mt-3 pt-2.5 border-t border-line">
                <div className="flex items-center gap-1.5 text-[11px] text-ink-2 min-w-0">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    {new Date(lead.updatedAt || lead.createdAt || '').toLocaleDateString('pt-BR')}
                    {lead.owner && <span className="truncate">· {lead.owner}</span>}
                </div>
                <div className="flex items-center gap-3">
                    {onConvert && (
                        <button
                            onClick={handleConvert}
                            disabled={converting}
                            title="Converter em oportunidade — move este lead para o funil de Negócios"
                            className="flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
                        >
                            {converting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRightCircle className="w-3 h-3" />}
                            {converting ? 'Convertendo...' : 'Converter'}
                        </button>
                    )}
                    {onEnrich && lead.companyId && (
                        <button
                            onClick={handleEnrich}
                            disabled={enriching}
                            title="Reenriquecer com dados da Receita Federal"
                            className="flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 disabled:opacity-50 transition-colors"
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
