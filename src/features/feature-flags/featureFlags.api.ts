import { api } from '../../lib/api';

export interface ResolvedFeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  isOverridden: boolean;
  /** Id do ADMIN que fez a última alteração do override — só presente quando `isOverridden`. */
  updatedByUserId?: string | null;
  /** Quando o override foi alterado pela última vez — string ISO (serializada via JSON). */
  updatedAt?: string | null;
}

export const featureFlagsApi = {
  list: () => api.get<ResolvedFeatureFlag[]>('/api/feature-flags'),
  setOverride: (key: string, enabled: boolean) =>
    api.put<ResolvedFeatureFlag>(`/api/feature-flags/${encodeURIComponent(key)}`, { enabled }),
  clearOverride: (key: string) =>
    api.delete<ResolvedFeatureFlag>(`/api/feature-flags/${encodeURIComponent(key)}`),
};
