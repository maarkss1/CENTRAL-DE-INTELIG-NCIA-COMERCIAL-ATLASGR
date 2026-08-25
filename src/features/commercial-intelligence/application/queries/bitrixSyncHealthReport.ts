/**
 * Saúde da integração Bitrix24 (Fase 7 — Qualidade do CRM) sobre os negócios abertos do funil
 * "Negócio" — quantos têm `bitrixLeadId`/`bitrixDealId` (vínculo real) e quantos tiveram a última
 * sincronização marcada como `failed` em `Lead.bitrixSyncStatus`. Não faz nenhuma chamada de rede
 * ao Bitrix — lê só o que já foi gravado localmente pelo `outboundSync`/webhook de entrada. Isolado
 * num arquivo próprio porque é a única parte de "Qualidade do CRM" que depende de uma integração
 * externa, e não de completude de campos.
 */

import type { BitrixSyncHealth, CommercialIntelligenceRepository, DealRow } from '../../domain/CommercialIntelligence';
import { DAY_MS, roundMoney } from '../shared/mathUtils';

export async function computeBitrixSyncHealth(repository: CommercialIntelligenceRepository, organizationId: string, open: DealRow[], now: Date): Promise<BitrixSyncHealth> {
    const connected = await repository.hasBitrixConnection(organizationId);
    const linkedDeals = open.filter((d) => d.bitrixLeadId || d.bitrixDealId);
    const failedDeals = open.filter((d) => d.bitrixSyncStatus === 'failed');
    // Janela fixa de 30 dias (seção 28) — atividade de sincronização é operacional, não segue
    // o período do filtro comercial escolhido na tela.
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const activity = connected
        ? await repository.getBitrixSyncActivity(organizationId, since)
        : { lastSyncAt: null, syncedCount: 0, failedCount: 0 };

    return {
        connected,
        totalOpen: open.length,
        linked: linkedDeals.length,
        notLinked: open.length - linkedDeals.length,
        failed: failedDeals.length,
        linkedRate: open.length > 0 ? roundMoney((linkedDeals.length / open.length) * 100) : null,
        failures: failedDeals.slice(0, 10).map((d) => ({
            leadId: d.id,
            title: d.title,
            companyName: d.companyName,
            error: d.bitrixSyncError,
            lastAttemptAt: d.bitrixSyncedAt ? d.bitrixSyncedAt.toISOString() : null,
        })),
        lastSyncAt: activity.lastSyncAt ? activity.lastSyncAt.toISOString() : null,
        syncedCount30d: activity.syncedCount,
        failedCount30d: activity.failedCount,
    };
}
