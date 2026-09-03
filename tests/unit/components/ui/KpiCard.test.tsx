/**
 * Cobertura de testes real (code-review, sessão "JoaoReisDiagnosticHub" / Pilot 028): KpiCard foi
 * promovido de componente local do Diagnóstico SDR a primitivo compartilhado em
 * src/components/ui/ sem nenhum teste dedicado — src/components/ui/AGENTS.md exige "testes
 * relevantes ao domínio" no gate mínimo antes de registrar sucesso.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckCircle } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';

afterEach(() => {
  cleanup();
});

describe('KpiCard', () => {
  it('mostra ícone, valor, rótulo e legenda', () => {
    render(
      <KpiCard icon={CheckCircle} label="Convertidos" value={11} caption="Receita ganha: R$ 180" />,
    );
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('Convertidos')).toBeInTheDocument();
    expect(screen.getByText('Receita ganha: R$ 180')).toBeInTheDocument();
  });

  it('renderiza como <div> (não interativo) quando não recebe onSelect', () => {
    render(<KpiCard icon={CheckCircle} label="Convertidos" value={11} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renderiza como botão acessível e dispara onSelect ao clicar, quando onSelect é passado', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<KpiCard icon={CheckCircle} label="Convertidos" value={11} onSelect={onSelect} />);

    const button = screen.getByRole('button');
    await user.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('reflete o estado `active` via aria-pressed', () => {
    const { rerender } = render(
      <KpiCard icon={CheckCircle} label="Convertidos" value={11} onSelect={vi.fn()} active={false} />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <KpiCard icon={CheckCircle} label="Convertidos" value={11} onSelect={vi.fn()} active={true} />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });
});
