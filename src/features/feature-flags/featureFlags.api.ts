import { api } from '../../lib/api';

export interface ResolvedFeatureFlag {
    key: string;
    description: string;
    enabled: boolean;
    isOverridden: boolean;
}

export const featureFlagsApi = {
    list: () => api.get<ResolvedFeatureFlag[]>('/api/feature-flags'),
    setOverride: (key: string, enabled: boolean) =>
        api.put<ResolvedFeatureFlag>(`/api/feature-flags/${encodeURIComponent(key)}`, { enabled }),
    clearOverride: (key: string) =>
        api.delete<ResolvedFeatureFlag>(`/api/feature-flags/${encodeURIComponent(key)}`),
};
