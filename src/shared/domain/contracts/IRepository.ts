/**
 * @file IRepository.ts
 * @description Generic repository contract, combining read and write capabilities.
 */

import type { IReadRepository } from './IReadRepository.js';
import type { IWriteRepository } from './IWriteRepository.js';

/**
 * Generic repository contract representing a complete Repository,
 * prepared for any Aggregate Root.
 *
 * @typeParam TEntity - Type of the entity persisted.
 * @typeParam TId - Type of the entity's identifier.
 */
export interface IRepository<TEntity, TId = string>
  extends IReadRepository<TEntity, TId>, IWriteRepository<TEntity, TId> {}
