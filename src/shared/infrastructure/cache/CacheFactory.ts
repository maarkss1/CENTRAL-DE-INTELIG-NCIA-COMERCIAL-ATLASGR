/**
 * @file CacheFactory.ts
 * @description Reusable factory for creating Cache instances.
 */

import type { Cache } from './Cache.js';
import { MemoryCache } from './MemoryCache.js';

export type CacheProvider<TValue = unknown> = () => Cache<TValue>;

export class CacheFactory {
  private static provider: CacheProvider = () => new MemoryCache();

  public static configure(provider: CacheProvider): void {
    CacheFactory.provider = provider;
  }

  public static create<TValue = unknown>(): Cache<TValue> {
    return CacheFactory.provider() as Cache<TValue>;
  }
}