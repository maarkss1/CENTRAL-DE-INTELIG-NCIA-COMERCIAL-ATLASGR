import React from 'react';
import type { LeadStatus, Lead } from '../../../types';
import { KanbanCard } from './KanbanCard';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { LEAD_STATUS_EMOJI as STATUS_EMOJI } from '../../../lib/enumMap';

interface KanbanColumnProps {
  status: LeadStatus;
  leads: Lead[];
  onCardClick: (lead: Lead) => void;
  onCardEnrich?: (leadId: string) => Promise<void>;
  onConvert?: (leadId: string) => Promise<void>;
  selectedLeadIds?: Set<string>;
  onToggleSelect?: (leadId: string) => void;
  selectionMode?: boolean;
}

export const KanbanColumn = React.memo(function KanbanColumn({
  status,
  leads,
  onCardClick,
  onCardEnrich,
  onConvert,
  selectedLeadIds,
  onToggleSelect,
  selectionMode,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: {
      type: 'Column',
      status,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col bg-surface rounded-2xl min-w-[320px] max-w-[320px] max-h-full shrink-0 border transition-colors duration-200 shadow-sm ${isOver ? 'border-brand dark:border-brand-2 bg-soft' : 'border-line'}`}
    >
      <div className="p-4 border-b border-line bg-surface-2/80 rounded-t-2xl sticky top-0 backdrop-blur-sm z-10 flex flex-col gap-1">
        <div className="flex justify-between items-center gap-2">
          <h3 className="text-sm font-bold text-ink-2 flex items-center gap-1.5 min-w-0">
            <span className="text-xs opacity-60 shrink-0" aria-hidden="true">
              {STATUS_EMOJI[status] || '📌'}
            </span>
            <span className="line-clamp-2 leading-tight">{status}</span>
          </h3>
          <span className="bg-surface-2 text-ink-2 text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
            {leads.length}
          </span>
        </div>
        <div className="text-xs text-brand-active dark:text-brand-2 font-medium">
          Forecast:{' '}
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
            leads.reduce((acc, lead) => {
              const val = typeof lead.amount === 'number' ? lead.amount : 0;
              const prob = typeof lead.probability === 'number' ? lead.probability : 0;
              const probMultiplier = prob > 1 ? prob / 100 : prob;
              return acc + val * probMultiplier;
            }, 0),
          )}
        </div>
      </div>

      {
        // Achado da auditoria (PR #328, item fora de escopo original): sem virtualização, uma
        // coluna populosa monta todos os `KanbanCard` no DOM de uma vez (até ~1000 leads/funil
        // buscados por `useCrmBoardController`, sem paginação real — ver `groupedLeads` em
        // `CrmBoard.tsx`). Analisado e DELIBERADAMENTE NÃO implementado agora, apesar de
        // `@tanstack/react-virtual` já ser dependência real do projeto e já ter um padrão pronto
        // (`ui/VirtualTable.tsx`, `CompanyList.tsx`): virtualizar esta lista especificamente exige
        // continuar passando TODOS os ids ao `SortableContext` do @dnd-kit (drag-and-drop e
        // reordenação por teclado dependem disso para colisão/foco), só renderizando via
        // windowing os `KanbanCard` VISÍVEIS — um padrão não-trivial de acertar sem quebrar o drag
        // por teclado (`crm-kanban.spec.ts`, já historicamente sensível a timing nesta suíte, ver
        // achado do PR #328 sobre esse mesmo teste) nem o autoscroll ao arrastar perto da borda da
        // janela virtualizada, e que exigiria validação visual/interativa real em navegador para
        // ser considerado concluído (não disponível neste ambiente/sessão). Forçar essa mudança
        // sem essa validação é mais arriscado do que manter o estado atual — ver seção 4 regra
        // #8 e seção 12 item 6 de .claude/CLAUDE.md.
      }
      <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-[150px] custom-scrollbar">
        <SortableContext items={leads.map((lead) => lead.id)} strategy={rectSortingStrategy}>
          {leads.map((lead) => (
            <KanbanCard
              key={lead.id}
              lead={lead}
              onClick={onCardClick}
              onEnrich={onCardEnrich}
              onConvert={onConvert}
              isSelected={selectedLeadIds?.has(lead.id)}
              onToggleSelect={onToggleSelect}
              selectionMode={selectionMode}
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
