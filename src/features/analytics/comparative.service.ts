
import { logger } from '../../lib/logger.js';
import { analyticsService } from './analytics.service.js';

export class ComparativeAnalyticsService {
    /**
     * Gera um relatório comparando métricas chave de dois ou mais tenants (ex: AtlasGR vs TotalTrac)
     * Isso só deve ser acessado por Super Admins que têm permissão de visualizar multi-tenancy.
     */
    async compareTenants(tenantIds: string[]) {
        if (!tenantIds || tenantIds.length < 2) {
            throw new Error('É necessário fornecer pelo menos dois tenantIds para comparação.');
        }

        try {
            const reports = await Promise.all(
                tenantIds.map(async (orgId) => {
                    const dashboard = await analyticsService.dashboard(orgId, 1);
                    return {
                        organizationId: orgId,
                        totalLeads: dashboard.overview.totalLeads,
                        wonLeads: dashboard.overview.closedThisMonth,
                        lostLeads: dashboard.overview.lostThisMonth,
                        conversionRate: dashboard.overview.conversionRate,
                        tmq: dashboard.tmqMetric,
                        topAgent: dashboard.performanceReport[0]?.agent || 'N/A'
                    };
                })
            );

            logger.info({ tenantIds }, 'Relatório comparativo multi-tenant gerado');

            return {
                timestamp: new Date().toISOString(),
                comparison: reports
            };
        } catch (err) {
            logger.error({ err }, 'Falha ao gerar relatório comparativo');
            throw err;
        }
    }
}

export const comparativeAnalyticsService = new ComparativeAnalyticsService();
