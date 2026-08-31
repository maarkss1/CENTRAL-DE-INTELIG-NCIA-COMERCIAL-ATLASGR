/**
 * VirtualTable — tabela virtualizada usando @tanstack/react-virtual
 *
 * Renderiza apenas as linhas visíveis na viewport, independente do total de dados.
 * Sem paginação forçada: o usuário scrolla livremente por centenas/milhares de registros.
 *
 * Uso:
 *   <VirtualTable
 *     data={companies}
 *     columns={columns}
 *     getRowKey={(row) => row.id}
 *     rowHeight={56}
 *     onRowClick={(row) => openDetail(row)}
 *   />
 */
import { useRef, ReactNode, CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface ColumnDef<T> {
  key: string;
  header: ReactNode;
  /** Largura em pixels ou string CSS. Default: 'auto' */
  width?: number | string;
  /** Alinhamento do conteúdo. Default: 'left' */
  align?: 'left' | 'center' | 'right';
  render: (row: T, index: number) => ReactNode;
  /** Renderiza um esqueleto de carregamento. */
  skeleton?: () => ReactNode;
}

interface VirtualTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  getRowKey: (row: T, index: number) => string | number;
  /** Altura fixa de cada linha em pixels. */
  rowHeight?: number;
  /** Altura do container scrollável. Default: '100%' */
  height?: number | string;
  /** Callback ao clicar numa linha. */
  onRowClick?: (row: T, index: number) => void;
  /** Renderiza uma mensagem quando data está vazio. */
  emptyState?: ReactNode;
  /** Mostra N linhas de skeleton enquanto carrega. */
  loading?: boolean;
  skeletonRows?: number;
  className?: string;
}

const DEFAULT_ROW_HEIGHT = 56;
const DEFAULT_SKELETON_ROWS = 8;

export function VirtualTable<T>({
  data,
  columns,
  getRowKey,
  rowHeight = DEFAULT_ROW_HEIGHT,
  height = '100%',
  onRowClick,
  emptyState,
  loading = false,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  className = '',
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowCount = loading ? skeletonRows : data.length;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 5, // Pré-renderiza 5 linhas acima/abaixo da viewport
  });

  const items = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  // Estado vazio
  if (!loading && data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ height }}
      >
        {emptyState ?? (
          <p className="text-sm text-ink-2">Nenhum registro encontrado.</p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`} style={{ height }}>
      {/* Cabeçalho fixo (não virtualizado) */}
      <div
        className="sticky top-0 z-10 flex shrink-0 border-b border-line bg-surface/90 backdrop-blur-sm"
        role="row"
        aria-rowindex={0}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            role="columnheader"
            className={`flex-shrink-0 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-ink-2
              ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
            style={colWidth(col.width)}
          >
            {col.header}
          </div>
        ))}
      </div>

      {/* Container scrollável virtualizado */}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto"
        role="rowgroup"
        aria-label="Tabela de dados"
      >
        {/* Spacer total — mantém o scroll bar proporcional */}
        <div style={{ height: totalHeight, width: '100%', position: 'relative' }}>
          {items.map((virtualRow) => {
            const isLoading = loading;
            const row = isLoading ? null : data[virtualRow.index];

            return (
              <div
                key={virtualRow.key}
                role="row"
                aria-rowindex={virtualRow.index + 1}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${virtualRow.size}px`,
                }}
                className={`flex items-center border-b border-line transition-colors
                  ${onRowClick && row ? 'cursor-pointer hover:bg-surface-2' : ''}
                  ${isLoading ? 'animate-pulse' : ''}
                `}
                onClick={
                  onRowClick && row
                    ? () => onRowClick(row, virtualRow.index)
                    : undefined
                }
                onKeyDown={
                  onRowClick && row
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row, virtualRow.index);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick && row ? 0 : -1}
              >
                {columns.map((col) => (
                  <div
                    key={col.key}
                    role="cell"
                    className={`flex-shrink-0 px-4 text-sm text-ink
                      ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
                    style={colWidth(col.width)}
                  >
                    {isLoading
                      ? (col.skeleton?.() ?? <div className="h-4 w-3/4 rounded-lg bg-surface-2" />)
                      : row !== null
                      ? col.render(row, virtualRow.index)
                      : null}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Helper: converte width prop em CSSProperties. */
function colWidth(width: number | string | undefined): CSSProperties {
  if (!width) return { flex: '1 1 auto', minWidth: 0 };
  if (typeof width === 'number') return { width, flexShrink: 0 };
  return { width, flexShrink: 0 };
}
