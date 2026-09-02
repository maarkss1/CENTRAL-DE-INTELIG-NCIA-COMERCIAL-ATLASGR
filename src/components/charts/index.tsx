/**
 * Componentes de gráficos ECharts para Analytics e Dashboard
 *
 * Provê: FunnelChart, SankeyChart, HeatmapChart, BarChart, LineChart
 * Todos respondem ao tema dark/light via useTheme() e são lazy-loaded
 * (echarts é pesado — ~750kB antes de tree-shake).
 *
 * Uso:
 *   import { FunnelChart } from '@/components/charts';
 *   <FunnelChart data={stageData} title="Pipeline de Vendas" />
 */
import { useEffect, useRef } from 'react';
import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';
import { useTheme } from '../../contexts/ThemeContext';

// Importa apenas os módulos necessários (tree-shaking manual do ECharts)
import * as echarts from 'echarts/core';
import { FunnelChart as EFunnelChart } from 'echarts/charts';
import { SankeyChart as ESankeyChart } from 'echarts/charts';
import { HeatmapChart as EHeatmapChart } from 'echarts/charts';
import { BarChart as EBarChart } from 'echarts/charts';
import { LineChart as ELineChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  VisualMapComponent,
  CalendarComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  EFunnelChart,
  ESankeyChart,
  EHeatmapChart,
  EBarChart,
  ELineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  VisualMapComponent,
  CalendarComponent,
  CanvasRenderer,
]);

// Paleta da marca AtlasGR
const ATLAS_COLORS = ['#F97316', '#FB923C', '#FDBA74', '#FED7AA', '#6B7280', '#9CA3AF'];
const DARK_BG = 'transparent';
const LIGHT_BG = 'transparent';

interface BaseChartProps {
  title?: string;
  height?: number | string;
  className?: string;
}

/** Hook base: inicializa e destrói instância ECharts. */
function useEChart(option: EChartsOption, deps: unknown[] = []) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;

    chartRef.current = echarts.init(containerRef.current, theme === 'dark' ? 'dark' : undefined, {
      renderer: 'canvas',
    });

    const handleResize = () => chartRef.current?.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption(option, { notMerge: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option, ...deps]);

  return containerRef;
}

// ─────────────────────────────────────────────────────────────────────────────
// FunnelChart — Pipeline de Vendas por estágio
// ─────────────────────────────────────────────────────────────────────────────
export interface FunnelData {
  name: string;
  value: number;
}

interface FunnelChartProps extends BaseChartProps {
  data: FunnelData[];
}

export function FunnelChart({ data, title, height = 300, className = '' }: FunnelChartProps) {
  const { theme } = useTheme();
  const option: EChartsOption = {
    backgroundColor: theme === 'dark' ? DARK_BG : LIGHT_BG,
    color: ATLAS_COLORS,
    title: title
      ? {
          text: title,
          textStyle: {
            color: theme === 'dark' ? '#F9FAFB' : '#111827',
            fontSize: 13,
            fontWeight: 700,
          },
        }
      : undefined,
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [
      {
        type: 'funnel',
        left: '5%',
        width: '90%',
        minSize: '0%',
        maxSize: '100%',
        sort: 'descending',
        gap: 4,
        label: { show: true, position: 'inside', color: '#fff', fontSize: 11, fontWeight: 700 },
        itemStyle: { borderColor: 'transparent', borderWidth: 0 },
        data,
      },
    ],
  };
  const ref = useEChart(option, [data, theme]);
  return (
    <div
      ref={ref}
      style={{ height }}
      className={`w-full ${className}`}
      role="img"
      aria-label={title ?? 'Gráfico funil'}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SankeyChart — Jornada do lead (canal → estágio → resultado)
// ─────────────────────────────────────────────────────────────────────────────
export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyChartProps extends BaseChartProps {
  nodes: { name: string }[];
  links: SankeyLink[];
}

export function SankeyChart({
  nodes,
  links,
  title,
  height = 350,
  className = '',
}: SankeyChartProps) {
  const { theme } = useTheme();
  const option: EChartsOption = {
    backgroundColor: theme === 'dark' ? DARK_BG : LIGHT_BG,
    color: ATLAS_COLORS,
    title: title
      ? {
          text: title,
          textStyle: {
            color: theme === 'dark' ? '#F9FAFB' : '#111827',
            fontSize: 13,
            fontWeight: 700,
          },
        }
      : undefined,
    tooltip: { trigger: 'item', triggerOn: 'mousemove' },
    series: [
      {
        type: 'sankey',
        data: nodes,
        links,
        emphasis: { focus: 'adjacency' },
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.4 },
        label: { color: theme === 'dark' ? '#D1D5DB' : '#374151', fontSize: 11 },
        itemStyle: { borderWidth: 0 },
      },
    ],
  };
  const ref = useEChart(option, [nodes, links, theme]);
  return (
    <div
      ref={ref}
      style={{ height }}
      className={`w-full ${className}`}
      role="img"
      aria-label={title ?? 'Gráfico sankey'}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HeatmapChart — Atividades por dia da semana × hora
// ─────────────────────────────────────────────────────────────────────────────
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => `${i}h`);

export interface HeatmapData {
  /** [hora (0-23), dia (0-6), valor] */
  data: [number, number, number][];
}

interface HeatmapChartProps extends BaseChartProps {
  data: HeatmapData['data'];
  maxValue?: number;
}

export function HeatmapChart({
  data,
  maxValue = 100,
  title,
  height = 200,
  className = '',
}: HeatmapChartProps) {
  const { theme } = useTheme();
  const option: EChartsOption = {
    backgroundColor: theme === 'dark' ? DARK_BG : LIGHT_BG,
    title: title
      ? {
          text: title,
          textStyle: {
            color: theme === 'dark' ? '#F9FAFB' : '#111827',
            fontSize: 13,
            fontWeight: 700,
          },
        }
      : undefined,
    // A tipagem de `formatter` do ECharts é uma união ampla de callbacks (TooltipOption); o
    // parâmetro de um heatmap chega como `{ data: [x, y, valor] }` — o cast do objeto inteiro
    // mantém o contrato real sem afrouxar para `any`.
    tooltip: {
      position: 'top' as const,
      // O heatmap sempre passa um único item (nunca o array de séries empilhadas de outros
      // charts), mas o tipo da lib (TopLevelFormatterParams) cobre os dois casos e permite
      // `data` ausente/não-array — normaliza em vez de assumir o shape.
      formatter: (rawParams: TooltipComponentFormatterCallbackParams) => {
        const item = Array.isArray(rawParams) ? rawParams[0] : rawParams;
        const cell = item?.data;
        if (!Array.isArray(cell)) return '';
        const [hourIndex, dayIndex, value] = cell as (number | string)[];
        return `${WEEKDAYS[dayIndex as number]} ${HOURS[hourIndex as number]}: ${value} atividades`;
      },
    },
    grid: { top: title ? 40 : 10, bottom: 30, left: 40, right: 10 },
    xAxis: {
      type: 'category',
      data: HOURS,
      splitArea: { show: true },
      axisLabel: { fontSize: 10, color: '#6B7280' },
    },
    yAxis: {
      type: 'category',
      data: WEEKDAYS,
      splitArea: { show: true },
      axisLabel: { fontSize: 10, color: '#6B7280' },
    },
    visualMap: {
      min: 0,
      max: maxValue,
      calculable: true,
      orient: 'horizontal',
      show: false,
      inRange: { color: ['#1F2937', '#F97316'] },
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: { show: false },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: '#F97316' } },
      },
    ],
  };
  const ref = useEChart(option, [data, maxValue, theme]);
  return (
    <div
      ref={ref}
      style={{ height }}
      className={`w-full ${className}`}
      role="img"
      aria-label={title ?? 'Heatmap de atividades'}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BarChart — genérico (horizontal ou vertical)
// ─────────────────────────────────────────────────────────────────────────────
export interface BarData {
  categories: string[];
  series: { name: string; data: number[] }[];
}

interface BarChartProps extends BaseChartProps {
  data: BarData;
  horizontal?: boolean;
}

export function BarChart({
  data,
  horizontal = false,
  title,
  height = 280,
  className = '',
}: BarChartProps) {
  const { theme } = useTheme();
  const axisStyle = {
    axisLabel: { fontSize: 11, color: '#6B7280' },
    axisLine: { lineStyle: { color: '#374151' } },
  };
  const option: EChartsOption = {
    backgroundColor: theme === 'dark' ? DARK_BG : LIGHT_BG,
    color: ATLAS_COLORS,
    title: title
      ? {
          text: title,
          textStyle: {
            color: theme === 'dark' ? '#F9FAFB' : '#111827',
            fontSize: 13,
            fontWeight: 700,
          },
        }
      : undefined,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { textStyle: { color: '#9CA3AF', fontSize: 11 }, bottom: 0 },
    grid: {
      top: title ? 44 : 10,
      bottom: data.series.length > 1 ? 40 : 20,
      left: 50,
      right: 20,
      containLabel: true,
    },
    [horizontal ? 'yAxis' : 'xAxis']: { type: 'category', data: data.categories, ...axisStyle },
    [horizontal ? 'xAxis' : 'yAxis']: {
      type: 'value',
      ...axisStyle,
      splitLine: { lineStyle: { color: '#1F2937' } },
    },
    series: data.series.map((s) => ({
      name: s.name,
      type: 'bar' as const,
      data: s.data,
      barMaxWidth: 40,
      borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
      label: { show: false },
      emphasis: { focus: 'series' },
    })),
  };
  const ref = useEChart(option, [data, horizontal, theme]);
  return (
    <div
      ref={ref}
      style={{ height }}
      className={`w-full ${className}`}
      role="img"
      aria-label={title ?? 'Gráfico de barras'}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LineChart — tendências ao longo do tempo
// ─────────────────────────────────────────────────────────────────────────────
export interface LineData {
  categories: string[];
  series: { name: string; data: number[]; smooth?: boolean }[];
}

interface LineChartProps extends BaseChartProps {
  data: LineData;
  area?: boolean;
}

export function LineChart({
  data,
  area = false,
  title,
  height = 280,
  className = '',
}: LineChartProps) {
  const { theme } = useTheme();
  const axisStyle = {
    axisLabel: { fontSize: 11, color: '#6B7280' },
    axisLine: { lineStyle: { color: '#374151' } },
  };
  const option: EChartsOption = {
    backgroundColor: theme === 'dark' ? DARK_BG : LIGHT_BG,
    color: ATLAS_COLORS,
    title: title
      ? {
          text: title,
          textStyle: {
            color: theme === 'dark' ? '#F9FAFB' : '#111827',
            fontSize: 13,
            fontWeight: 700,
          },
        }
      : undefined,
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: '#9CA3AF', fontSize: 11 }, bottom: 0 },
    grid: {
      top: title ? 44 : 10,
      bottom: data.series.length > 1 ? 40 : 20,
      left: 50,
      right: 20,
      containLabel: true,
    },
    xAxis: { type: 'category', data: data.categories, boundaryGap: false, ...axisStyle },
    yAxis: { type: 'value', ...axisStyle, splitLine: { lineStyle: { color: '#1F2937' } } },
    series: data.series.map((s, i) => ({
      name: s.name,
      type: 'line' as const,
      data: s.data,
      smooth: s.smooth ?? true,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { width: 2 },
      ...(area
        ? {
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: `${ATLAS_COLORS[i % ATLAS_COLORS.length]}40` },
                { offset: 1, color: `${ATLAS_COLORS[i % ATLAS_COLORS.length]}00` },
              ]),
            },
          }
        : {}),
    })),
  };
  const ref = useEChart(option, [data, area, theme]);
  return (
    <div
      ref={ref}
      style={{ height }}
      className={`w-full ${className}`}
      role="img"
      aria-label={title ?? 'Gráfico de linha'}
    />
  );
}
