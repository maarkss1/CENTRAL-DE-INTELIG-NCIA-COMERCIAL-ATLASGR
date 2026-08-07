/**
 * Paleta e chrome de gráficos (recharts) compartilhados entre Analytics e Billing.
 * Valores validados contra a superfície escura dos cards (#0a1022) — ver comentário original
 * em Analytics.tsx: ΔE >= 9.4 em CVD e >= 20.9 em visão normal para os pares usados.
 */

/** Cor única para gráficos que comparam apenas uma medida (slot 1 do tema categórico). */
export const SINGLE = '#3987e5';

/** Tinta e chrome recessivos (labels, grid, eixos) para os gráficos. */
export const INK = { muted: '#898781', grid: '#2c2c2a', axis: '#383835' } as const;

/** Estilo do tooltip do recharts, consistente entre os dashboards de analytics e billing. */
export const tooltipStyle = {
    backgroundColor: '#0d0d0d',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    fontSize: 12,
    color: '#ffffff',
} as const;
