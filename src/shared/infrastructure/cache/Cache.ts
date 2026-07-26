/**
 * @file Cache.ts
 * @description Generic cache contract, decoupled from any concrete cache provider.
 */

export interface Cache<TValue = unknown> {
  get(key: string): Promise<TValue | undefined>;
  set(key: string, value: TValue, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
}