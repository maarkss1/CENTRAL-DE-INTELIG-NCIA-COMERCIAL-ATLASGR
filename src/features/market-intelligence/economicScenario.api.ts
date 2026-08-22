import { api } from '../../lib/api';
import type {
    EconomicScenarioSaveInput,
    SavedEconomicScenario,
    SavedEconomicScenarioSummary,
} from './domain/economicScenarioAudit';

const BASE = '/api/market-intelligence/economic-scenarios';

export const economicScenarioApi = {
    list: (limit = 20) => api.get<SavedEconomicScenarioSummary[]>(`${BASE}?limit=${Math.max(1, Math.min(50, limit))}`),
    get: (id: string) => api.get<SavedEconomicScenario>(`${BASE}/${encodeURIComponent(id)}`),
    save: (input: EconomicScenarioSaveInput) => api.post<SavedEconomicScenario>(BASE, input),
};
