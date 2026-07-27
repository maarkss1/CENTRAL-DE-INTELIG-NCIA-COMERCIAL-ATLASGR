/**
 * @file index.ts
 * @description Public API surface of the Infrastructure cache module.
 */

export type { Cache } from './Cache.js';
export { MemoryCache } from './MemoryCache.js';
export { CacheFactory, type CacheProvider } from './CacheFactory.js';