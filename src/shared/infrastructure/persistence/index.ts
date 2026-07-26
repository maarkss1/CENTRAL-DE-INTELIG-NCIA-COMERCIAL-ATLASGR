/**
 * @file index.ts
 * @description Public API surface of the Infrastructure persistence module.
 */

export type { Repository } from './Repository.js';
export { BaseRepository, type PersistenceGateway } from './BaseRepository.js';
export type { Transaction, TransactionFactory } from './Transaction.js';
export { UnitOfWork } from './UnitOfWork.js';
export { RepositoryFactory, type RepositoryFactoryFn } from './RepositoryFactory.js';