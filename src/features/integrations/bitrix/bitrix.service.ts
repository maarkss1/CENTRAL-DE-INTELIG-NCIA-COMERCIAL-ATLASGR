// ARCH-009 (auditoria de dívida técnica): 857L / complexidade proxy 203 — o maior do repo. Cinco
// responsabilidades reais conviviam no mesmo arquivo (conexões, listagem/import de Leads,
// listagem/import de Deals, push Atlas→Bitrix e regras de sincronização automática), cada uma
// com sua própria lógica de filtro/mapeamento de campos. Decomposto em service/:
// - service/client.ts: cliente HTTP de baixo nível (callBitrix), validação de webhook, cache de
//   status labels — o "BitrixClient" sugerido pelo checklist.
// - service/connections.ts: CRUD de conexões (portais Bitrix conectados a uma organização).
// - service/leads.ts: listagem/importação do objeto Lead do Bitrix.
// - service/deals.ts: listagem/importação do objeto Deal/Negócio (com pipeline/etapa).
// - service/outboundSync.ts: push Atlas → Bitrix (mapeamento de campos — o "BitrixFieldMapper"
//   sugerido pelo checklist vive dentro de syncLeadToBitrix, não fazia sentido isolar só o
//   mapeamento de um único caller sem introduzir uma camada artificial).
// - service/syncRules.ts: regras de sincronização automática + runBitrixSyncTick — o
//   "BitrixSyncService" sugerido pelo checklist.
// Este arquivo agora só reexporta a API pública, preservando os imports existentes em
// bitrix.routes.ts, prospecting.service.ts, bitrixSync.worker.ts e LeadUseCases.ts (import
// dinâmico) sem exigir nenhuma mudança neles.

export { normalizeWebhookUrl, testWebhook, hostnameOf, getConnectionWebhookUrl, callBitrix, getStatusLabels } from './service/client.js';

export type { BitrixConnectionSummary } from './service/connections.js';
export {
    listBitrixConnections, connectBitrix, disconnectBitrix, testBitrixConnection,
    regenerateWebhookSecret, setInboundEventsEnabled,
} from './service/connections.js';

export type { BitrixLeadSummary, BitrixLeadFilters } from './service/leads.js';
export { getLeadStatuses, listBitrixLeads, importSelectedBitrixLeads, findUnimportedBitrixLeadIds } from './service/leads.js';

export type { BitrixDealPipeline, BitrixDealStage, BitrixUserOption, BitrixDealSummary, BitrixDealFilters } from './service/deals.js';
export { getDealPipelines, getDealStages, getBitrixUsers, listBitrixDeals, importSelectedBitrixDeals, findUnimportedBitrixDealIds } from './service/deals.js';

export type { SyncLeadOverrides } from './service/outboundSync.js';
export { pushLeadToBitrix, exportLeadToBitrixNow } from './service/outboundSync.js';

export type { BitrixSyncRuleInput } from './service/syncRules.js';
export { listSyncRules, createSyncRule, setSyncRuleActive, deleteSyncRule, runBitrixSyncTick } from './service/syncRules.js';

export { resolveEnumMaps, buildOutboundCustomFields, applyInboundCustomFields, getEntityFields } from './service/customFields.js';
export type { BitrixEntityKind, BitrixFieldOption } from './service/customFields.js';
