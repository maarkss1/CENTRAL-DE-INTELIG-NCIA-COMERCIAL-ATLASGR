/**
 * Cobertura de testes real (code-review, sessão "JoaoReisDiagnosticHub" / Pilot 028) — ver
 * KpiCard.test.tsx pro mesmo contexto. FunnelBars calcula largura proporcional ao maior valor da
 * lista; o caso de borda relevante é lista com um único item (não deve dividir por zero).
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FunnelBars, type FunnelBarItem } from '@/components/ui/FunnelBars';

afterEach(() => {
  cleanup();
});

describe('FunnelBars', () => {
  const items: FunnelBarItem[] = [
    { id: 'NEW', label: 'Lead inbound', value: 80, tone: 'brand' },
    { id: 'CONVERTED', label: 'Convertido', value: 20, tone: 'ok' },
    { id: 'JUNK', label: 'Desqualificado', value: 40, tone: 'critical' },
  ];

  it('mostra o rótulo e o valor de cada item', () => {
    render(<FunnelBars items={items} />);
    expect(screen.getByText('Lead inbound')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('Convertido')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('calcula a largura da barra proporcional ao maior valor da lista', () => {
    render(<FunnelBars items={items} />);
    // maior valor é 80 (Lead inbound) -> 100%; Convertido (20) -> 25%
    const inboundBar = screen.getByLabelText('Lead inbound: 80').querySelector('div');
    const convertedBar = screen.getByLabelText('Convertido: 20').querySelector('div');
    expect(inboundBar).toHaveStyle({ width: '100%' });
    expect(convertedBar).toHaveStyle({ width: '25%' });
  });

  it('não divide por zero quando todos os valores são 0 (usa piso de 1 pro máximo)', () => {
    render(<FunnelBars items={[{ id: 'x', label: 'Vazio', value: 0 }]} />);
    const bar = screen.getByLabelText('Vazio: 0').querySelector('div');
    expect(bar).toHaveStyle({ width: '0%' });
  });

  it('usa o tom "brand" por padrão quando `tone` não é passado', () => {
    render(<FunnelBars items={[{ id: 'x', label: 'Sem tom', value: 10 }]} />);
    const bar = screen.getByLabelText('Sem tom: 10').querySelector('div');
    expect(bar?.className).toContain('bg-brand');
  });
});
