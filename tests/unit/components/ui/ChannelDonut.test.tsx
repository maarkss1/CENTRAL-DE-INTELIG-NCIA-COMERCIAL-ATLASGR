/**
 * Cobertura de testes real (code-review, sessão "JoaoReisDiagnosticHub" / Pilot 028) — ver
 * KpiCard.test.tsx pro mesmo contexto. O teste "dado vazio" cobre um bug real encontrado nesta
 * revisão: `data` sem nenhuma entrada > 0 gerava `conic-gradient()` (sem stops), CSS inválido que
 * deixava o anel transparente sem nenhum indício de "sem dados".
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ChannelDonut } from '@/components/ui/ChannelDonut';

afterEach(() => {
  cleanup();
});

describe('ChannelDonut', () => {
  it('mostra o total e ordena os canais do maior pro menor valor', () => {
    render(
      <ChannelDonut
        data={{ WhatsApp: 2, Ligação: 4, 'E-mail': 15 }}
        totalLabel="atividades"
        colorMap={{ Ligação: 'var(--brand)' }}
      />,
    );
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('atividades')).toBeInTheDocument();

    const labels = screen.getAllByText(/WhatsApp|Ligação|E-mail/).map((el) => el.textContent);
    expect(labels).toEqual(['E-mail', 'Ligação', 'WhatsApp']);
  });

  it('aplica formatLabel a cada rótulo da lista', () => {
    render(
      <ChannelDonut
        data={{ 'Contatar cliente (genérico)': 10 }}
        formatLabel={(label) => label.replace(' (genérico)', '')}
      />,
    );
    expect(screen.getByText('Contatar cliente')).toBeInTheDocument();
    expect(screen.queryByText('Contatar cliente (genérico)')).not.toBeInTheDocument();
  });

  it('com dado vazio, mostra o estado vazio em vez de gerar conic-gradient() inválido', () => {
    const { container } = render(<ChannelDonut data={{}} emptyLabel="Sem dados neste período." />);
    expect(screen.getByText('Sem dados neste período.')).toBeInTheDocument();

    const ring = container.querySelector('[role="img"]') as HTMLElement;
    expect(ring.style.background).not.toContain('conic-gradient()');
    expect(ring.style.background).toBe('var(--surface-2)');
  });

  it('trata canais com valor 0 como ausentes (não aparecem na lista nem quebram o anel)', () => {
    render(<ChannelDonut data={{ WhatsApp: 0, Ligação: 5 }} />);
    expect(screen.queryByText('WhatsApp')).not.toBeInTheDocument();
    expect(screen.getByText('Ligação')).toBeInTheDocument();
  });
});
