import React, { useState, useRef, useEffect } from "react";
import { Lead } from '../../../types';
import { Building2, User, Calendar, Sparkles, Loader2, ArrowRightCircle } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TechToolLogo } from '../../../components/ui/TechToolLogo';

const TEMPERATURE_EMOJI: Record<string, string> = { Quente: '🔥', Morno: '🌤️', Frio: '❄️' };

// Hierarquia visual do badge de score — usa o campo `temperature` já existente (categórico:
// Quente/Morno/Frio), sem inventar threshold novo em cima do número de `score`. Emoji + número
// continuam sempre presentes (cor nunca é o único sinal); o que varia entre os 3 níveis é só o
// "peso" do badge — preenchimento mais forte pra Quente, neutro/sem preenchimento pra Frio — pra
// dar hierarquia sem virar semáforo, arco-íris ou glow. Frio usa bg-surface (transparente sobre o
// card) porque text-ink-2 sobre bg-surface-2 fica em 4.24:1, abaixo de AA — sobre bg-surface (o
// fundo real do card) dá 4.77:1.
const SCORE_BADGE_CLASS: Record<string, string> = {
    Quente: 'bg-blue-500/30 border-blue-500/50 text-blue-700 dark:text-blue-300',
    Morno: 'bg-blue-500/20 border-blue-500/30 text-blue-700 dark:text-blue-300',
    Frio: 'bg-transparent border-line text-ink-2',
};
const DEFAULT_SCORE_BADGE_CLASS = SCORE_BADGE_CLASS.Morno;

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
    const companyName = lead.company?.tradeName || lead.company?.legalName || '';
    const hasCompanyName = companyName.length > 0;

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
            // border-brand/ring-brand sozinhos falham o mínimo de contraste não-textual (3:1) da
            // Total Trac em dark mode: --brand da Total Trac é #374898 (navy), só 2.25:1 contra a
            // superfície escura — confirmado por cálculo real (getComputedStyle + fórmula WCAG),
            // não "parece diferente". dark:hover:border-brand-2 / dark:ring-brand-2 trocam pro azul
            // de acento mais claro (#008FCE) só no tema escuro, que dá 5.15:1; a AtlasGR passa nos
            // dois casos com qualquer um dos dois tokens.
            className={`bg-surface rounded-2xl border border-line shadow-md hover:border-brand/50 dark:hover:border-brand-2/50 hover:shadow-xl transition-all group ${isDragging ? 'shadow-2xl ring-2 ring-brand dark:ring-brand-2 z-50 bg-surface-2' : ''}`}
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
                role="button"
                tabIndex={0}
                // dnd-kit não expõe o estado de "pego" via aria-pressed sozinho — attributes/listeners
                // só trazem role/aria-roledescription/aria-describedby. Sem isto, um leitor de tela não
                // tem como saber, depois do Espaço de pickup, que o card está em modo de arrasto por
                // teclado (só a pista visual de isDragging, que é invisível pra quem usa teclado+leitor).
                aria-pressed={isDragging}
                onClick={() => onClick(lead)}
                // `onKeyDown` sobrescreve o de `{...listeners}` (mesma prop, spread antes — a última
                // declaração vence) — sem encaminhar pro handler do dnd-kit primeiro, o Space de
                // pickup nunca chegava ao KeyboardSensor e o drag por teclado nunca ativava de
                // verdade, apesar dos atributos ARIA de sortable estarem todos presentes. O sensor
                // agora só escuta Space (ver CrmBoard.tsx KEYBOARD_DRAG_CODES), então Enter aqui é
                // exclusivamente "abrir detalhes", sem ambiguidade com o pickup do drag.
                onKeyDown={(e) => {
                    listeners?.onKeyDown?.(e);
                    if (e.key === 'Enter') onClick(lead);
                }}
                className="p-4 pb-0 cursor-grab active:cursor-grabbing"
            >
                <div className="flex justify-between items-start gap-2 mb-2">
                    {/* line-clamp-2 (em vez de 1 linha truncada ou altura livre) evita que um nome
                        muito longo estoure o card sem esconder o nome inteiro; title nativo dá
                        acesso ao nome completo sem popover novo. Sem empresa vinculada é tratado
                        como dado incompleto — itálico/tom secundário em vez do mesmo peso de um
                        nome real, sem novo componente/alerta. */}
                    {hasCompanyName ? (
                        <h4 title={companyName} className="font-bold text-ink group-hover:text-brand-active dark:group-hover:text-brand-2 transition-colors text-sm line-clamp-2 leading-snug">
                            {companyName}
                        </h4>
                    ) : (
                        <h4 className="font-medium italic text-ink-2 text-sm">
                            Sem empresa <span className="not-italic">· dados incompletos</span>
                        </h4>
                    )}
                    {lead.score && (
                        <span className={`shrink-0 text-xs font-extrabold border px-2 py-0.5 rounded-lg ${lead.temperature ? (SCORE_BADGE_CLASS[lead.temperature] ?? DEFAULT_SCORE_BADGE_CLASS) : DEFAULT_SCORE_BADGE_CLASS}`}>
                            {lead.temperature ? `${TEMPERATURE_EMOJI[lead.temperature] || ''} ` : ''}{lead.score}
                        </span>
                    )}
                </div>
                
                {Boolean(lead.customFields?.voiceQualified) && (
                    <div className="mb-2">
                        <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                            🎤 Voz Qualificada
                        </span>
                    </div>
                )}

                <div className="space-y-2 mt-2 text-xs text-ink-2">
                    {lead.contact && (
                        <div className="flex items-center gap-1.5 text-ink-2">
                            <User className="w-3.5 h-3.5 text-ink-2" />
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
                            // text-brand-active dark:text-brand-2 (não dark:text-brand simples):
                            // --brand cru da Total Trac (#374898) só dá 2.25:1 sobre a superfície
                            // escura, abaixo até do mínimo não-textual — teria ficado quase
                            // ilegível no card. brand-2 (#008FCE, acento) dá 5.15:1. Confirmado via
                            // canvas + fórmula de contraste real, nas duas marcas — ver relato.
                            className="flex items-center gap-1 text-[11px] font-bold text-brand-active dark:text-brand-2 hover:opacity-75 disabled:opacity-50 transition-colors"
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
