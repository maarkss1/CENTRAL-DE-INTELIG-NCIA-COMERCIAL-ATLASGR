import type { FitScoreResult } from '../../../services/enrichment.service';

export interface PromoteResult {
    lead: { id: string };
    fit?: FitScoreResult;
    enrichment?: {
        company: {
            googleRating?: number;
            googleReviewsCount?: number;
            observations?: string;
        };
        apolloContacts?: Array<{ name: string; title: string | null; email: string | null; phone?: string | null; linkedin_url?: string | null }>;
    };
}

export function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

export interface ToolsStatus {
    providerMode: 'free' | 'hybrid';
    googlePlaces: { configured: boolean };
    apollo: { configured: boolean };
    hunter: { configured: boolean };
}
