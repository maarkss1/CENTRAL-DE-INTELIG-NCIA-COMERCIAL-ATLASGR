/**
 * @file index.ts
 * @description Public API surface of the Domain contracts layer.
 */

export type {
  IReadRepository,
  FindAllOptions,
  FilterOptions,
  SortOption,
  SortDirection,
  PaginatedQueryOptions,
  PaginatedQueryResult,
} from './IReadRepository.js';
export type { IWriteRepository } from './IWriteRepository.js';
export type { IRepository } from './IRepository.js';
export type { IUnitOfWork } from './IUnitOfWork.js';
export type { IDomainEventDispatcher, DomainEventHandler } from './IDomainEventDispatcher.js';
