import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Total de itens, mostrado ao lado do número de páginas (ex.: "42 contatos"). */
  totalItems?: number;
  /** Rótulo no plural pro totalItems (ex.: "contatos", "empresas"). */
  itemLabel?: string;
}

/** Paginação compartilhada entre ContactList e CompanyList — mesma lógica que as duas já tinham
    duplicada, com uma aparência única (antes ContactList usava ícones sozinhos e CompanyList
    usava texto "Anterior"/"Próxima"; aqui os dois convergem pro mesmo componente). */
export function Pagination({ page, totalPages, onPageChange, totalItems, itemLabel }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="p-4 border-t border-line bg-surface-2/50 flex items-center justify-between">
      <span className="text-xs text-ink-2 font-semibold">
        Página {page} de {totalPages}
        {typeof totalItems === 'number' && itemLabel ? ` · ${totalItems} ${itemLabel}` : ''}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-line text-ink-2 hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer text-xs font-semibold"
        >
          <ChevronLeft className="w-4 h-4" /> Anterior
        </button>
        <button
          type="button"
          disabled={page === totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-line text-ink-2 hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer text-xs font-semibold"
        >
          Próxima <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
