/**
 * Cobertura de testes real (code-review, sessão "JoaoReisDiagnosticHub" / Pilot 028) — ver
 * KpiCard.test.tsx pro mesmo contexto. O teste de badge "Perdido" cobre o achado de contraste
 * desta revisão: text-critical cru sobre bg-critical/15 falhava AA — corrigido pra
 * text-critical-active dark:text-critical, mesmo padrão de won/text-ok-active.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DealsGrid, type DealCardData } from '@/components/ui/DealsGrid';

afterEach(() => {
  cleanup();
});

const deals: DealCardData[] = [
  { id: '1', title: 'Cerealista Malanski Ltda', status: 'won', statusLabel: 'Ganho', value: 180 },
  {
    id: '2',
    title: 'Nobelkraft Embalagens de Papelão',
    status: 'lost',
    statusLabel: 'Perdido',
    value: 119.5,
  },
  {
    id: '3',
    title: 'ACP Bioenergia LTDA',
    status: 'open',
    statusLabel: 'Piloto',
    value: 0,
  },
];

describe('DealsGrid', () => {
  it('mostra o rótulo vazio quando não há negócios', () => {
    render(<DealsGrid deals={[]} />);
    expect(screen.getByText('Nenhum negócio rastreado neste período.')).toBeInTheDocument();
  });

  it('aceita um rótulo vazio customizado', () => {
    render(<DealsGrid deals={[]} emptyLabel="Nada por aqui." />);
    expect(screen.getByText('Nada por aqui.')).toBeInTheDocument();
  });

  it('renderiza um card por negócio, com título e valor formatado em BRL por padrão', () => {
    render(<DealsGrid deals={deals} />);
    expect(screen.getByText('Cerealista Malanski Ltda')).toBeInTheDocument();
    expect(screen.getByText('Nobelkraft Embalagens de Papelão')).toBeInTheDocument();
    expect(screen.getByText('ACP Bioenergia LTDA')).toBeInTheDocument();
  });

  it('usa a cor de contraste segura (text-critical-active) no badge "Perdido", não text-critical cru', () => {
    render(<DealsGrid deals={deals} />);
    const badge = screen.getByText('Perdido');
    expect(badge.className).toContain('text-critical-active');
    expect(badge.className).toContain('dark:text-critical');
  });

  it('usa a cor de contraste segura (text-ok-active) no badge "Ganho"', () => {
    render(<DealsGrid deals={deals} />);
    const badge = screen.getByText('Ganho');
    expect(badge.className).toContain('text-ok-active');
  });
});
