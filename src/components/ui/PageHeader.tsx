import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Ações à direita (botões, filtros) — mesmo padrão dos cabeçalhos de Analytics/Atividades. */
  actions?: ReactNode;
}

/**
 * Cabeçalho padrão de tela: título + subtítulo + ícone opcional, usando os tokens do design
 * system (text-ink/text-ink-2) e a mesma hierarquia visual já usada em Analytics e Atividades.
 * Componha a partir daqui em telas novas em vez de repetir o markup de h1/p em cada módulo.
 */
export function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 p-6 pb-4">
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="w-11 h-11 rounded-2xl bg-surface-2 border border-line flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-ink tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-ink-2 mt-0.5 font-medium">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
