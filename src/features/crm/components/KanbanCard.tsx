import React, { useState, useRef, useEffect } from 'react';
import {
  Building2,
  User,
  Calendar,
  Sparkles,
  Loader2,
  ArrowRightCircle,
  CheckSquare,
  Square,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TechToolLogo } from '../../../components/ui/TechToolLogo';
import type { Lead } from '../../../types';

const TEMPERATURE_EMOJI: Record<string, string> = { Quente: '🔥', Morno: '🌤️', Frio: '❄️' };

const SCORE_BADGE_CLASS: Record<string, string> = {
  Quente: 'bg-blue-500/30 border-blue-500/50 text-blue-700 dark:text-blue-300',
  Morno: 'bg-blue-500/20 border-blue-500/30 text-blue-700 dark:text-blue-300',
  Frio: 'bg-transparent border-line text-ink-2',
};
const DEFAULT_SCORE_BADGE_CLASS = SCORE_BADGE_CLASS.Morno;

function getStagnationBadge(days: number) {
  if (days <= 2) {
    return {
      label: `${days === 0 ? 'Hoje' : `${days}d`} sem parada`,
      className: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
      dot: 'bg-emerald-500',
    };
  }
  if (days <= 7) {
    return {
      label: `${days}d parado`,
      className: 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300',
      dot: 'bg-amber-500',
    };
  }
  return {
    label: `${days}d estagnado`,
    className: 'bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300 font-bold',
    dot: 'bg-rose-500 animate-pulse',
  };
}

interface KanbanCardProps {
  lead: Lead;
  onClick: (lead: Lead) => void;
  onEnrich?: (leadId: string) => Promise<void>;
  onConvert?: (leadId: string) => Promise<void>;
  isSelected?: boolean;
  onToggleSelect?: (leadId: string) => void;
  selectionMode?: boolean;
}

export const KanbanCard = React.memo(function KanbanCard({
  lead,
  onClick,
  onEnrich,
  onConvert,
  isSelected = false,
  onToggleSelect,
  selectionMode = false,
}: KanbanCardProps) {
  const [enriching, setEnriching] = useState(false);
  const [converting, setConverting] = useState(false);
  const techRowRef = useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: {
      type: 'Lead',
      lead,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const companyTech = lead.company?.technologies || [];
  const companyName = lead.company?.tradeName || lead.company?.legalName || '';
  const hasCompanyName = companyName.length > 0;

  // Cálculo de tempo de estagnação (dias sem interação/atualização)
  const lastActivityDate = lead.lastInteraction || lead.updatedAt || lead.createdAt;
  const daysStale = lastActivityDate
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24)),
      )
    : 0;
  const stagnation = getStagnationBadge(daysStale);

  const isBitrixSynced = Boolean(lead.bitrixLeadId || lead.bitrixDealId);

  useEffect(() => {
    const buttons = techRowRef.current?.querySelectorAll('button');
    buttons?.forEach((btn: HTMLButtonElement) => {
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

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.(lead.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-surface rounded-2xl border transition-all group relative ${
        isSelected
          ? 'border-brand ring-2 ring-brand shadow-lg bg-surface-2/70'
          : 'border-line shadow-md hover:border-brand/50 dark:hover:border-brand-2/50 hover:shadow-xl'
      } ${isDragging ? 'shadow-2xl ring-2 ring-brand dark:ring-brand-2 z-50 bg-surface-2' : ''}`}
    >
      {/* Checkbox de seleção múltipla (visível no hover ou quando selectionMode está ativo) */}
      {(selectionMode || isSelected) && (
        <button
          type="button"
          onClick={handleCheckboxClick}
          aria-label={isSelected ? `Desmarcar ${companyName}` : `Selecionar ${companyName}`}
          className="absolute top-3 left-3 z-20 p-1 rounded-lg bg-surface border border-line text-brand hover:scale-110 transition-transform shadow-sm"
        >
          {isSelected ? (
            <CheckSquare className="w-4 h-4 text-brand fill-brand/20" />
          ) : (
            <Square className="w-4 h-4 text-ink-2" />
          )}
        </button>
      )}

      <div
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={0}
        onClick={() => onClick(lead)}
        onKeyDown={(e) => {
          listeners?.onKeyDown?.(e);
          if (e.key === 'Enter') onClick(lead);
        }}
        className={`p-4 pb-0 cursor-grab active:cursor-grabbing ${selectionMode || isSelected ? 'pl-9' : ''}`}
      >
        {/* Cabeçalho do Card: Empresa, Temperatura e Score */}
        <div className="flex justify-between items-start gap-2 mb-2">
          {hasCompanyName ? (
            <h4
              title={companyName}
              className="font-bold text-ink group-hover:text-brand-active dark:group-hover:text-brand-2 transition-colors text-sm line-clamp-2 leading-snug"
            >
              {companyName}
            </h4>
          ) : (
            <h4 className="font-medium italic text-ink-2 text-sm">
              Sem empresa <span className="not-italic">· dados incompletos</span>
            </h4>
          )}
          {lead.score !== undefined && lead.score !== null ? (
            <span
              className={`shrink-0 text-xs font-black border px-2 py-0.5 rounded-lg flex items-center gap-1 ${
                lead.score >= 70
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                  : lead.score >= 40
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                    : 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
              }`}
            >
              {lead.temperature ? `${TEMPERATURE_EMOJI[lead.temperature] || ''} ` : '🎯 '}
              {lead.score}
            </span>
          ) : lead.temperature ? (
            <span
              className={`shrink-0 text-xs font-extrabold border px-2 py-0.5 rounded-lg ${SCORE_BADGE_CLASS[lead.temperature] ?? DEFAULT_SCORE_BADGE_CLASS}`}
            >
              {TEMPERATURE_EMOJI[lead.temperature]} {lead.temperature}
            </span>
          ) : null}
        </div>

        {/* Badges Informativas: Estagnação, Bitrix e Voz */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {/* Indicador Visual de Estagnação (Verde < 3d, Amarelo 3-7d, Vermelho > 7d) */}
          <span
            title={`Última atividade: ${new Date(lastActivityDate || '').toLocaleDateString('pt-BR')}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] border ${stagnation.className}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${stagnation.dot}`} />
            {stagnation.label}
          </span>

          {isBitrixSynced && (
            <span
              title={`Sincronizado no Bitrix24 (ID #${lead.bitrixLeadId || lead.bitrixDealId})`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-500/15 border border-sky-500/30 text-sky-700 dark:text-sky-300"
            >
              🌐 Bitrix #{lead.bitrixLeadId || lead.bitrixDealId}
            </span>
          )}

          {Boolean(lead.customFields?.voiceQualified) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
              🎤 Voz Qualificada
            </span>
          )}
        </div>

        {/* Badges Informativas: Estagnação, Bitrix e Voz */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {/* Indicador Visual de Estagnação (Verde < 3d, Amarelo 3-7d, Vermelho > 7d) */}
          <span
            title={`Última atividade: ${new Date(lastActivityDate || '').toLocaleDateString('pt-BR')}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] border ${stagnation.className}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${stagnation.dot}`} />
            {stagnation.label}
          </span>

          {isBitrixSynced && (
            <span
              title={`Sincronizado no Bitrix24 (ID #${lead.bitrixLeadId || lead.bitrixDealId})`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-500/15 border border-sky-500/30 text-sky-700 dark:text-sky-300"
            >
              🌐 Bitrix #{lead.bitrixLeadId || lead.bitrixDealId}
            </span>
          )}

          {Boolean(lead.customFields?.voiceQualified) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
              🎤 Voz Qualificada
            </span>
          )}
        </div>

        <div className="space-y-1.5 mt-2 text-xs text-ink-2">
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

          {companyTech.length > 0 && (
            <>
              <div ref={techRowRef} aria-hidden="true" className="flex flex-wrap gap-1 pt-1">
                {companyTech.slice(0, 3).map((tech: string, i: number) => (
                  <TechToolLogo key={i} techName={tech} size="sm" />
                ))}
              </div>
              <span className="sr-only">
                Tecnologias detectadas: {companyTech.slice(0, 3).join(', ')}
              </span>
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
              {converting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ArrowRightCircle className="w-3 h-3" />
              )}
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
              {enriching ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {enriching ? 'Enriquecendo...' : 'Enriquecer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
