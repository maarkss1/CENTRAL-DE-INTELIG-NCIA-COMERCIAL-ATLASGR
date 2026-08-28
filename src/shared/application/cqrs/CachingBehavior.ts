/**
 * @file CachingBehavior.ts
 * @description Reusable pipeline behavior for caching Query results.
 */

import { Result } from '../base/Result.js';
import type { ApplicationError } from '../base/ApplicationError.js';
import type { UseCaseContext } from '../base/UseCaseContext.js';
import type { PipelineBehavior, PipelineNext } from './PipelineBehavior.js';

export interface CachingBehaviorStore<TValue> {
  get(key: string): Promise<TValue | undefined>;
  set(key: string, value: TValue, ttlMs?: number): Promise<void>;
}

export type CacheKeyResolver<TRequest> = (request: TRequest) => string;

export class CachingBehavior<TRequest, TValue> implements PipelineBehavior<TRequest, TValue> {
  private readonly store: CachingBehaviorStore<TValue>;
  private readonly resolveKey: CacheKeyResolver<TRequest>;
  private readonly ttlMs: number | undefined;

  public constructor(
    store: CachingBehaviorStore<TValue>,
    resolveKey: CacheKeyResolver<TRequest>,
    ttlMs?: number,
  ) {
    this.store = store;
    this.resolveKey = resolveKey;
    this.ttlMs = ttlMs;
  }

  public async handle(
    request: TRequest,
    _context: UseCaseContext,
    next: PipelineNext<TValue>,
  ): Promise<Result<TValue, ApplicationError>> {
    const key = this.resolveKey(request);
    const cached = await this.store.get(key);

    if (cached !== undefined) {
      return Result.ok<TValue, ApplicationError>(cached);
    }

    const result = await next();

    if (result.isSuccess()) {
      await this.store.set(key, result.getValue(), this.ttlMs);
    }

    return result;
  }
}
