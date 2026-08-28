import { api } from '../../../lib/api';

export interface BitrixConnectionItem {
  id: string;
  label: string;
  webhookUrl: string;
  createdAt: string;
  inboundEventsEnabled: boolean;
}

export interface BitrixLeadItem {
  id: string;
  title: string;
  statusId: string;
  statusLabel: string;
  assignedById: string;
  assignedByName: string;
  dateCreate: string;
  name?: string;
  lastName?: string;
  companyTitle?: string;
  phone?: string;
  email?: string;
}

export interface BitrixDealItem {
  id: string;
  title: string;
  stageId: string;
  stageLabel: string;
  categoryId: string;
  opportunity: number;
  currencyId: string;
  assignedById: string;
  assignedByName: string;
  dateCreate: string;
  companyTitle?: string;
  contactName?: string;
}

export const bitrixApi = {
  listConnections: async (): Promise<BitrixConnectionItem[]> => {
    const res = await api.get<{ data: BitrixConnectionItem[] }>('/api/bitrix/connections');
    return res.data;
  },

  listLeads: async (
    connectionId: string,
    search?: string,
  ): Promise<{ leads: BitrixLeadItem[]; total: number }> => {
    const query = new URLSearchParams({ connectionId });
    if (search) query.set('search', search);
    const res = await api.get<{ data: { leads: BitrixLeadItem[]; total: number } }>(
      `/api/bitrix/leads?${query.toString()}`,
    );
    return res.data;
  },

  listDeals: async (
    connectionId: string,
    search?: string,
  ): Promise<{ deals: BitrixDealItem[]; total: number }> => {
    const query = new URLSearchParams({ connectionId });
    if (search) query.set('search', search);
    const res = await api.get<{ data: { deals: BitrixDealItem[]; total: number } }>(
      `/api/bitrix/deals?${query.toString()}`,
    );
    return res.data;
  },

  importLeads: async (connectionId: string, bitrixLeadIds: string[]) => {
    return api.post('/api/bitrix/leads/import', { connectionId, bitrixLeadIds });
  },

  importDeals: async (connectionId: string, bitrixDealIds: string[]) => {
    return api.post('/api/bitrix/deals/import', { connectionId, bitrixDealIds });
  },

  importRecentBitrixLeads: async () => {
    return api.post<{ success: boolean; data: { imported: number; skipped: number } }>(
      '/api/crm/leads/import/bitrix24',
      {},
    );
  },

  exportLead: async (leadId: string, connectionId?: string) => {
    return api.post<{ success: boolean; data: { bitrixLeadId: string } }>(
      `/api/bitrix/leads/${leadId}/export`,
      { connectionId },
    );
  },

  exportLeadsBatch: async (leadIds?: string[], connectionId?: string) => {
    return api.post<{ success: boolean; data: { exportedCount: number; skippedCount: number } }>(
      '/api/bitrix/leads/export-batch',
      { leadIds, connectionId },
    );
  },
};
