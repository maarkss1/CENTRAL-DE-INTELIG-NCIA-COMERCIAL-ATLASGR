import type {
    ExecutiveOverview,
    PerformanceMetrics,
    PipelineCreation,
    ExecutiveAlert,
    ExportFormat,
    ExportKpiRow,
} from '../domain/CommercialIntelligence';

/**
 * Serialização em CSV/JSON/HTML dos dados JÁ CALCULADOS por `executiveOverview`/`performance`/
 * `pipelineCreation`/`alerts` (`CommercialIntelligenceUseCases.ts`) — nunca recalcula uma métrica
 * aqui, só formata o que os use cases já apuraram. Mesmo espírito do Cockpit legado
 * (`cockpitListaKpisExport`/`cockpitExportarCSV`/`cockpitExportarJSON`/`cockpitGerarHTMLExport` em
 * `js/cockpit.js`), reimplementado em TS puro e testável sem mock de rede/banco.
 */

function money(value: number | null): string | null {
    return value == null ? null : String(Math.round((value + Number.EPSILON) * 100) / 100);
}

function raw(value: number | string | null): string | null {
    return value == null ? null : String(value);
}

/** Monta a lista plana [bloco, indicador, valor, unidade] — base comum do CSV e do HTML. */
export function buildExecutiveExportRows(
    overview: ExecutiveOverview,
    performance: PerformanceMetrics,
    creation: PipelineCreation,
    alerts: ExecutiveAlert[]
): ExportKpiRow[] {
    const rows: ExportKpiRow[] = [];
    const currency = overview.goal?.currency ?? 'BRL';
    const add = (block: string, indicator: string, value: string | null, unit: string) => {
        rows.push({ block, indicator, value: value == null || value === '' ? 'Não disponível' : value, unit });
    };

    add('Resultado do Mês', 'Meta New MRR', overview.goal ? money(overview.goal.amount) : null, currency);
    add('Resultado do Mês', 'Fechado', money(overview.closedAmount), currency);
    add('Resultado do Mês', '% da Meta', raw(overview.pctOfGoal), '%');
    add('Resultado do Mês', 'Negócios ganhos', raw(overview.closedCount), 'qtd');

    add('Forecast', 'Commit', money(overview.commitAmount), currency);
    add('Forecast', 'Best Case', money(overview.bestCaseAmount), currency);
    add('Forecast', 'Upside (informativo)', money(overview.upsideAmount), currency);
    add('Forecast', 'Forecast', money(overview.forecastAmount), currency);
    add('Forecast', 'Gap Forecast', money(overview.gapForecast), currency);
    add('Forecast', 'Gap Commit', money(overview.gapCommit), currency);

    add('Pipeline', 'Pipeline Total', money(overview.pipelineTotal), currency);
    add('Pipeline', 'Pipeline Elegível', money(overview.pipelineEligible), currency);
    add('Pipeline', 'Coverage do mês', raw(overview.coverageMonth.coverage), 'x');
    add('Pipeline', 'Coverage 30 dias', raw(overview.coverage30.coverage), 'x');
    add('Pipeline', 'Coverage 60 dias', raw(overview.coverage60.coverage), 'x');
    add('Pipeline', 'Coverage 90 dias', raw(overview.coverage90.coverage), 'x');
    add('Pipeline', 'Pipeline Criado no período', money(creation.amount), currency);
    add('Pipeline', 'Pipeline Necessário (Meta ÷ Win Rate)', money(creation.pipelineNeeded), currency);
    add('Pipeline', 'Creation Coverage', creation.creationCoverage != null ? raw(Math.round(creation.creationCoverage * 1000) / 10) : null, '%');
    add('Pipeline', 'Ritmo de criação (pace)', raw(creation.pacePercent), '%');
    add(
        'Pipeline',
        'Dias úteis decorridos / total do mês',
        creation.businessDaysTotal > 0 ? `${creation.businessDaysElapsed}/${creation.businessDaysTotal}` : null,
        'dias úteis'
    );

    add('Eficiência', 'Win Rate', raw(performance.winRate), '%');
    add('Eficiência', 'Ganhos no período', raw(performance.wonCount), 'qtd');
    add('Eficiência', 'Perdidos no período', raw(performance.lostCount), 'qtd');
    add('Eficiência', 'Ticket médio (aberto)', money(performance.averageTicket.open), currency);
    add('Eficiência', 'Sales Cycle (média)', raw(performance.salesCycle.meanDays), 'dias');
    add('Eficiência', 'Sales Cycle (mediana)', raw(performance.salesCycle.medianDays), 'dias');
    add('Eficiência', 'Oportunidades estagnadas', raw(performance.opportunities.stalled), 'qtd');

    if (alerts.length === 0) {
        add('Alertas', 'Nenhum risco identificado', 'Nenhum alerta ativo neste snapshot', '');
    } else {
        alerts.forEach((alert) => add('Alertas', alert.title, alert.description, ''));
    }

    return rows;
}

function csvEscape(value: string): string {
    return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * `;` como delimitador (não `,`) e BOM UTF-8 no início — mesma técnica de compatibilidade com
 * Excel PT-BR já documentada em `toCsv` de `features/integrations/bitrix/service/extractionFiles.ts`
 * (reimplementada localmente aqui, não importada de outro módulo — cada feature deste repositório
 * mantém seus próprios helpers de serialização, ver `pipelineEligibility.ts`/`lossTaxonomy.ts`).
 */
export function rowsToCsv(rows: ExportKpiRow[]): string {
    const header = ['bloco', 'indicador', 'valor', 'unidade'];
    const lines = [header.join(';')];
    for (const row of rows) lines.push([row.block, row.indicator, row.value, row.unit].map(csvEscape).join(';'));
    return '﻿' + lines.join('\r\n');
}

export interface ExecutiveExportJson {
    generatedAt: string;
    period: string;
    overview: ExecutiveOverview;
    performance: PerformanceMetrics;
    pipelineCreation: PipelineCreation;
    alerts: ExecutiveAlert[];
}

/** JSON completo: o objeto já calculado por cada use case, sem achatar/perder nenhum campo. */
export function buildExecutiveExportJson(
    overview: ExecutiveOverview,
    performance: PerformanceMetrics,
    creation: PipelineCreation,
    alerts: ExecutiveAlert[],
    now: Date
): ExecutiveExportJson {
    return {
        generatedAt: now.toISOString(),
        period: overview.period,
        overview,
        performance,
        pipelineCreation: creation,
        alerts,
    };
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * HTML autônomo (sem CSS externo, sem JS) para impressão/arquivo — não é uma réplica da UI React,
 * mesmo espírito do `cockpitGerarHTMLExport` legado: um snapshot estático dos números já
 * calculados, sem novo acesso a rede/banco.
 */
export function buildExecutiveExportHtml(rows: ExportKpiRow[], alerts: ExecutiveAlert[], period: string, generatedAtIso: string): string {
    const byBlock = new Map<string, ExportKpiRow[]>();
    for (const row of rows) {
        if (!byBlock.has(row.block)) byBlock.set(row.block, []);
        byBlock.get(row.block)!.push(row);
    }
    const blocksHtml = [...byBlock.entries()]
        .map(
            ([block, items]) => `
        <h2>${escapeHtml(block)}</h2>
        <table><tbody>${items
                .map(
                    (it) =>
                        `<tr><td>${escapeHtml(it.indicator)}</td><td>${escapeHtml(it.value)}${it.unit ? ` <span class="unit">${escapeHtml(it.unit)}</span>` : ''}</td></tr>`
                )
                .join('')}</tbody></table>`
        )
        .join('');

    const alertsHtml = alerts.length
        ? `<ul class="alerts">${alerts.map((a) => `<li><strong>${escapeHtml(a.title)}</strong> — ${escapeHtml(a.description)}</li>`).join('')}</ul>`
        : '<p>Nenhum risco identificado neste snapshot.</p>';

    const generatedAtLabel = new Date(generatedAtIso).toLocaleString('pt-BR');

    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório Executivo — Comercial Inteligente (${escapeHtml(period)})</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;margin:32px;color:#1a1a1a;background:#fff}
h1{font-size:22px;margin-bottom:4px}
h2{font-size:15px;margin-top:28px;border-bottom:2px solid #ff5618;padding-bottom:4px;color:#1a1a1a}
p.meta{color:#666;font-size:13px;margin-top:0}
table{width:100%;border-collapse:collapse;margin-top:8px}
td{padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;vertical-align:top}
td:first-child{color:#555;width:60%}
.unit{color:#888;font-size:11px}
ul.alerts{padding-left:18px;font-size:13px}
footer{margin-top:32px;color:#999;font-size:11px}
</style></head><body>
<h1>Relatório Executivo — Comercial Inteligente</h1>
<p class="meta">Período de referência: ${escapeHtml(period)} · Gerado em ${escapeHtml(generatedAtLabel)}</p>
<h2>Alertas</h2>
${alertsHtml}
${blocksHtml}
<footer>Gerado automaticamente pelo Comercial Inteligente — AtlasGR. Nenhuma credencial/webhook incluído neste arquivo.</footer>
</body></html>`;
}

export interface ExecutiveExportPayload {
    content: string;
    mimeType: string;
    fileExtension: string;
}

/** Ponto único que decide, a partir do `format` pedido, qual serializador chamar. */
export function buildExecutiveExport(
    format: ExportFormat,
    overview: ExecutiveOverview,
    performance: PerformanceMetrics,
    creation: PipelineCreation,
    alerts: ExecutiveAlert[],
    now: Date
): ExecutiveExportPayload {
    const rows = buildExecutiveExportRows(overview, performance, creation, alerts);
    if (format === 'csv') {
        return { content: rowsToCsv(rows), mimeType: 'text/csv; charset=utf-8', fileExtension: 'csv' };
    }
    if (format === 'html') {
        return { content: buildExecutiveExportHtml(rows, alerts, overview.period, now.toISOString()), mimeType: 'text/html; charset=utf-8', fileExtension: 'html' };
    }
    return {
        content: JSON.stringify(buildExecutiveExportJson(overview, performance, creation, alerts, now), null, 2),
        mimeType: 'application/json; charset=utf-8',
        fileExtension: 'json',
    };
}
