import { Fragment, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

/* Novo primitivo — tabela comparativa com linhas de grupo e células marcadas melhor/pior
   (equivalente tabular ao CompareBar, pra métricas melhor lidas em grade do que em barra). */
export interface CompareTableColumn {
  key: string;
  label: string;
}

export interface CompareTableCell {
  value: ReactNode;
  tone?: 'melhor' | 'pior' | 'neutral';
}

export interface CompareTableRow {
  id: string;
  /** Rótulo do grupo — quando muda em relação à linha anterior, insere um separador de seção. */
  group?: string;
  label: string;
  cells: CompareTableCell[];
}

export function CompareTable({
  columns,
  rows,
}: {
  columns: CompareTableColumn[];
  rows: CompareTableRow[];
}) {
  let lastGroup: string | undefined;
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            <th className="sticky top-0 bg-surface px-2 py-2 text-left text-[10.5px] font-bold uppercase tracking-wide text-ink-2">
              Métrica
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                className="sticky top-0 bg-surface px-2 py-2 text-right text-[10.5px] font-bold uppercase tracking-wide text-ink-2"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const showGroup = row.group && row.group !== lastGroup;
            lastGroup = row.group;
            return (
              <Fragment key={row.id}>
                {showGroup && (
                  <tr key={`${row.id}-group`}>
                    <td
                      colSpan={columns.length + 1}
                      className="rounded-[6px] bg-brand/[0.08] px-2 pb-1.5 pt-2.5 text-[10px] font-black uppercase tracking-wide text-brand"
                    >
                      {row.group}
                    </td>
                  </tr>
                )}
                <tr className="border-b border-line last:border-b-0">
                  <td className="px-2 py-2 align-top font-semibold text-ink">{row.label}</td>
                  {row.cells.map((cell, i) => (
                    <td
                      key={columns[i]?.key ?? i}
                      className={cn(
                        'px-2 py-2 text-right align-top font-mono tabular-nums',
                        cell.tone === 'melhor' && 'font-bold text-ok-active dark:text-ok',
                        cell.tone === 'pior' && 'font-bold text-critical',
                      )}
                    >
                      {cell.value}
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
