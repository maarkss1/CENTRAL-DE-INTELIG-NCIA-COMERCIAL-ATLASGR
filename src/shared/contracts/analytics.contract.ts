/**
 * Fonte única de verdade para o contrato de `OverviewMetrics` — o resumo agregado de KPIs do CRM
 * (empresas, contatos, leads, atividades, funil, pipeline) usado tanto pela API de Analytics
 * (`/api/analytics/overview`, `/api/analytics/dashboard`) quanto pelo relatório semanal em PDF.
 *
 * Contexto (Onda 8, Agente 18 — Contratos, API e Documentação Viva): até esta unificação, o mesmo
 * formato existia declarado de forma independente em 3 lugares — `src/features/analytics/domain/
 * Analytics.ts` (camada de domínio, versão "wired"), `src/features/analytics/analytics.service.ts`
 * (serviço legado, ainda consumido por `src/features/crm/jobs/weeklyPdfReport.worker.ts`) e
 * `src/features/analytics/analytics.api.ts` (cliente HTTP do frontend). Os três tinham campos
 * idênticos hoje, mas sem nenhuma relação de import entre si — divergiam sem que o typecheck
 * pudesse detectar (`.agents/prompts/18-contratos-api-docs.md`, missão 2; `PLATFORM_COMPLETION_
 * REPORT.md`).
 *
 * Este módulo é a origem canônica proposta. Ele NÃO substitui automaticamente as três declarações
 * acima — mudar código de feature é responsabilidade dos donos de domínio (04 para o backend de
 * Analytics/BI, 02 para o consumo no frontend), conforme handoffs `.agents/handoffs/onda-8/
 * 18-para-04-unificar-overviewmetrics.md` e `.agents/handoffs/onda-8/
 * 18-para-02-unificar-overviewmetrics-frontend.md`. Depois da migração, as três interfaces locais
 * devem ser substituídas por `import type { OverviewMetrics } from '../../shared/contracts/
 * analytics.contract.js'` (ou caminho relativo equivalente).
 */
export interface OverviewMetrics {
    totalCompanies: number;
    totalContacts: number;
    /** Leads em aberto (fora dos status de fechamento: ganho, perdido, desqualificado, piloto cancelado). */
    totalLeads: number;
    totalActivities: number;
    pendingActivities: number;
    overdueActivities: number;
    closedThisMonth: number;
    lostThisMonth: number;
    conversionRate: number;
    /** Média do score dos leads em aberto, ou `null` se nenhum lead tem score preenchido. */
    averageScore: number | null;
    /**
     * Soma de `Lead.amount` dos leads em aberto (fora de ganho/perdido/desqualificado/piloto
     * cancelado) que têm valor preenchido. `null` quando nenhum lead em aberto tem `amount`
     * preenchido — o frontend exibe "—" em vez de inventar um número (nunca fabrica 0 ou uma média
     * para preencher a interface, ver `/AGENTS.md` → "Dados reais x demonstração").
     */
    pipelineValue: number | null;
}
