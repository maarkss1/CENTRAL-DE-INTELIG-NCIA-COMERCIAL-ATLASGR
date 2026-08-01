import type Redis from 'ioredis';
import { cacheConnection, queuesEnabled } from '../../../lib/queue/redis.js';
import { logger } from '../../../lib/logger.js';
import type { IEnrichmentResult } from '../../../types/enrichment.js';

const DEFAULT_CACHE_TTL_SECONDS = 24 * 60 * 60;

export interface CachedDomainGuess {
    domain: string | null;
    verified: boolean;
    emails: string[];
}

export interface CachedEnrichmentPayload {
    result: IEnrichmentResult;
    domainGuess: CachedDomainGuess;
    icebreaker?: string;
    cachedAt: string;
}

export interface EnrichmentCacheKey {
    organizationId?: string | null;
    companyId: string;
}

type CacheClient = Pick<Redis, 'get' | 'set'>;

function resolveCacheTtlSeconds(): number {
    const configured = Number(process.env.ENRICHMENT_CACHE_TTL_SECONDS);
    if (!Number.isFinite(configured) || configured <= 0) {
        return DEFAULT_CACHE_TTL_SECONDS;
    }
    return Math.min(Math.floor(configured), 7 * 24 * 60 * 60);
}

function cacheKey({ organizationId, companyId }: EnrichmentCacheKey): string {
    const tenant = (organizationId || 'unscoped').replace(/[^a-zA-Z0-9_-]/g, '_');
    const company = companyId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `enrichment:v1:${tenant}:${company}`;
}

function isCachedPayload(value: unknown): value is CachedEnrichmentPayload {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Partial<CachedEnrichmentPayload>;
    return Boolean(
        payload.result?.enrichment &&
        Array.isArray(payload.result.enrichment.sources) &&
        payload.domainGuess &&
        Array.isArray(payload.domainGuess.emails)
    );
}

export class EnrichmentCacheService {
    constructor(
        private readonly client: CacheClient = cacheConnection,
        private readonly enabled = queuesEnabled,
        private readonly ttlSeconds = resolveCacheTtlSeconds()
    ) {}

    async get(key: EnrichmentCacheKey): Promise<CachedEnrichmentPayload | null> {
        if (!this.enabled) return null;

        try {
            const cached = await this.client.get(cacheKey(key));
            if (!cached) return null;

            const parsed: unknown = JSON.parse(cached);
            if (!isCachedPayload(parsed)) return null;

            return {
                ...parsed,
                result: {
                    ...parsed.result,
                    enrichment: {
                        ...parsed.result.enrichment,
                        cacheHit: true,
                    },
                },
            };
        } catch (error) {
            logger.warn({ err: error, companyId: key.companyId }, 'Failed to read enrichment cache');
            return null;
        }
    }

    async set(key: EnrichmentCacheKey, payload: CachedEnrichmentPayload): Promise<void> {
        if (!this.enabled) return;

        try {
            await this.client.set(cacheKey(key), JSON.stringify(payload), 'EX', this.ttlSeconds);
        } catch (error) {
            logger.warn({ err: error, companyId: key.companyId }, 'Failed to write enrichment cache');
        }
    }
}
