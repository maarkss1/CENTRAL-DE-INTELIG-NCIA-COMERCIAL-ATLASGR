/**
 * Cobertura de testes real (code-review, sessão "JoaoReisDiagnosticHub" / Pilot 028) — ver
 * KpiCard.test.tsx pro mesmo contexto. O teste "série bem menor" cobre um bug real encontrado
 * nesta revisão: o rótulo formatado ficava dentro do preenchimento via `justify-end`, e no piso de
 * 2% de largura o texto vazava pra fora do segmento colorido (só o trilho tinha overflow-hidden,
 * não o preenchimento). Acima do limiar o rótulo continua dentro da barra; abaixo, passa a ficar
 * fora, à direita do trilho.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CompareBar, DeltaPill } from '@/components/ui/CompareBar';

afterEach(() => {
  cleanup();
});

describe('CompareBar', () => {
  it('mostra o rótulo da linha e o valor formatado de cada série', () => {
    render(
      <CompareBar
        label="Leads novos"
        seriesA={{ label: 'Julho', value: 79 }}
        seriesB={{ label: 'Agosto', value: 131 }}
      />,
    );
    expect(screen.getByText('Leads novos')).toBeInTheDocument();
    expect(screen.getAllByText('79')).not.toHaveLength(0);
    expect(screen.getAllByText('131')).not.toHaveLength(0);
  });

  it('usa o `format` customizado (ex. moeda) nas duas séries', () => {
    const format = (v: number) => `R$ ${v}`;
    render(
      <CompareBar
        label="Receita ganha"
        seriesA={{ label: 'Julho', value: 180 }}
        seriesB={{ label: 'Agosto', value: 363 }}
        format={format}
      />,
    );
    expect(screen.getAllByText('R$ 180')).not.toHaveLength(0);
    expect(screen.getAllByText('R$ 363')).not.toHaveLength(0);
  });

  it('quando uma série é muito menor que a outra, o rótulo aparece fora do trilho em vez de vazar pelo preenchimento', () => {
    render(
      <CompareBar
        label="Pipeline"
        seriesA={{ label: 'Julho', value: 3 }}
        seriesB={{ label: 'Agosto', value: 300 }}
      />,
    );
    // seriesA (3 de 300) fica abaixo do limiar de 18% de largura -> rótulo some do preenchimento
    // e reaparece como texto solo ao lado do trilho.
    const trackA = screen.getByLabelText('Julho: 3');
    expect(trackA.querySelector('span')).toBeNull();
    expect(screen.getByText('3')).toBeInTheDocument();

    // seriesB (300 de 300) preenche 100% -> rótulo continua dentro do preenchimento.
    const trackB = screen.getByLabelText('Agosto: 300');
    expect(trackB.querySelector('span')).not.toBeNull();
  });
});

describe('DeltaPill', () => {
  it('mostra "+" e a cor positiva quando value > 0', () => {
    render(<DeltaPill value={65.8} />);
    const pill = screen.getByText('+65.8%');
    expect(pill.className).toContain('text-ok-active');
  });

  it('mostra a cor negativa (sem "+") quando value < 0', () => {
    render(<DeltaPill value={-6.25} />);
    const pill = screen.getByText('-6.25%');
    expect(pill.className).toContain('text-critical-active');
  });

  it('inclui a nota entre parênteses quando passada', () => {
    render(<DeltaPill value={-66.4} note="gargalo" />);
    expect(screen.getByText('-66.4% (gargalo)')).toBeInTheDocument();
  });

  it('usa o tom neutro quando value é exatamente 0', () => {
    render(<DeltaPill value={0} />);
    const pill = screen.getByText('0%');
    expect(pill.className).toContain('text-ink-2');
  });
});
