/**
 * @file MemoryCache.ts
 * @description In-memory Cache implementation with optional TTL support.
 */

import type { Cache } from './Cache.js';

interface CacheEntry<TValue> {
  readonly value: TValue;
  readonly expiresAt: number | undefined;
}

export class MemoryCache<TValue = unknown> implements Cache<TValue> {
  private readonly store = new Map<string, CacheEntry<TValue>>();

  public async get(key: string): Promise<TValue | undefined> {
    const entry = this.store.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  public async set(key: string, value: TValue, ttlMs?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlMs === undefined ? undefined : Date.now() + ttlMs,
    });
  }

  public async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  public async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  public async clear(): Promise<void> {
    this.store.clear();
  }
}