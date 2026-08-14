import { describe, it, expect, beforeEach } from 'vitest';
import client from 'prom-client';
import { bitrixSyncFailuresTotal } from '../metrics.js';

async function getMetricValue(tenant: string, entity: string): Promise<number> {
    const metric = await bitrixSyncFailuresTotal.get();
    const point = metric.values.find((v) => v.labels.tenant === tenant && v.labels.entity === entity);
    return point?.value ?? 0;
}

describe('bitrixSyncFailuresTotal — handoff 10-para-06 (bloqueador #11)', () => {
    beforeEach(() => {
        bitrixSyncFailuresTotal.reset();
    });

    it('está registrada no Registry padrão do prom-client com o nome exigido pelo alerta BitrixSyncFailuresHigh', () => {
        // infrastructure/observability/alert.rules.yml referencia exatamente este nome —
        // divergência aqui deixa a regra "unknown" pra sempre, mesmo com a métrica existindo.
        expect(client.register.getSingleMetric('bitrix_sync_failures_total')).toBeDefined();
    });

    it('incrementa por tenant e entity independentemente', async () => {
        bitrixSyncFailuresTotal.inc({ tenant: 'org-1', entity: 'lead' });
        bitrixSyncFailuresTotal.inc({ tenant: 'org-1', entity: 'lead' });
        bitrixSyncFailuresTotal.inc({ tenant: 'org-2', entity: 'deal' });

        expect(await getMetricValue('org-1', 'lead')).toBe(2);
        expect(await getMetricValue('org-2', 'deal')).toBe(1);
    });

    it('não lança ao ser importada mais de uma vez (guard contra "already registered")', async () => {
        // Simula o que outboundSync.ts, syncRules.ts e bitrixSync.worker.ts fazem — todos
        // importam este módulo; o guard em metrics.ts precisa reaproveitar a métrica existente.
        const reimported = await import('../metrics.js');
        expect(reimported.bitrixSyncFailuresTotal).toBe(bitrixSyncFailuresTotal);
    });
});
