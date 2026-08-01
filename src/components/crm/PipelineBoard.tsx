import React, { useState } from 'react';
import { PipelineBoard as PipelineBoardModel, PipelineColumn, PipelineDealCard } from '../../shared/types/crm';
import { MoreHorizontal, Plus } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export type PipelineBoardProps = {
  board: PipelineBoardModel;
};

export function PipelineBoard({ board: initialBoard }: PipelineBoardProps): React.JSX.Element {
  const [board] = useState(initialBoard);
  const [activeDeal, setActiveDeal] = useState<PipelineDealCard | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragStart = (event: any) => {
    const { active } = event;
    const dealId = active.id;
    // Find the deal across all columns
    for (const column of board.columns) {
      const deal = column.deals.find(d => d.id === dealId);
      if (deal) {
        setActiveDeal(deal);
        break;
      }
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    setActiveDeal(null);

    if (!over) return;

    const activeId = active.id;
    const overId = over.id; // Could be a column ID or another deal ID

    if (activeId === overId) return;

    // Simplified DnD state update logic for demonstration
    // In a real app, this would dispatch to backend and update local state optimistically
    // handle drag over
  };

  return (
    <section className="flex flex-col h-full bg-slate-50">
      <header className="flex justify-between items-center p-6 bg-white border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">{board.title}</h2>
          <p className="text-sm text-slate-500">{board.pipelineName}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col text-right">
            <span className="text-sm text-slate-500">Valor Total</span>
            <strong className="text-lg text-slate-900">{board.totalValueLabel}</strong>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
            <Plus size={16} />
            Novo Deal
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto p-6">
        <DndContext 
          sensors={sensors} 
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-6 h-full min-w-max">
            {board.columns.map((column) => (
              <PipelineStageColumn key={column.id} column={column} />
            ))}
          </div>
          <DragOverlay>
            {activeDeal ? <DealCard deal={activeDeal} isDragging /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </section>
  );
}

function PipelineStageColumn({ column }: { column: PipelineColumn; key?: React.Key }): React.JSX.Element {
  return (
    <div className="flex flex-col w-80 bg-slate-100 rounded-lg shrink-0" id={column.id}>
      <header className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-100 rounded-t-lg">
        <div>
          <h3 className="font-medium text-slate-700">{column.name}</h3>
          <p className="text-xs text-slate-500">{column.valueLabel}</p>
        </div>
        <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-1 rounded-full">
          {column.dealCount}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
        <SortableContext items={column.deals.map(d => d.id)} strategy={verticalListSortingStrategy}>
          {column.deals.length === 0 ? (
            <div className="p-4 border-2 border-dashed border-slate-300 rounded-md text-center">
              <p className="text-sm text-slate-500">Nenhum deal nesta etapa</p>
            </div>
          ) : (
            column.deals.map((deal) => <SortableDealCard deal={deal} key={deal.id} />)
          )}
        </SortableContext>
      </div>
    </div>
  );
}

function SortableDealCard({ deal }: { deal: PipelineDealCard; key?: React.Key }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <DealCard deal={deal} isDragging={isDragging} />
    </div>
  );
}

function DealCard({ deal, isDragging }: { deal: PipelineDealCard, isDragging?: boolean }): React.JSX.Element {
  return (
    <article className={`bg-white p-4 rounded shadow-sm border border-slate-200 hover:shadow-md transition cursor-grab active:cursor-grabbing group ${isDragging ? 'shadow-xl ring-2 ring-blue-500' : ''}`}>
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-semibold text-slate-800 text-sm leading-tight">{deal.title}</h4>
        <button className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition">
          <MoreHorizontal size={16} />
        </button>
      </div>
      <div className="flex justify-between items-end mt-4">
        <div className="flex flex-col">
          <span className="text-xs text-slate-500">{deal.companyId || 'Sem Empresa'}</span>
          <strong className="text-sm font-medium text-blue-600 mt-1">{deal.amountLabel}</strong>
        </div>
        {deal.ownerName && (
          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600" title={deal.ownerName}>
            {deal.ownerName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </article>
  );
}
