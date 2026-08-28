/**
 * @file IUnitOfWork.ts
 * @description Abstraction for coordinating transactional boundaries, decoupled from any database.
 */

/**
 * Abstraction for transactional execution.
 *
 * Prepared for `begin`, `commit`, `rollback` and asynchronous transactions,
 * with no dependency on Prisma or any concrete database driver.
 */
export interface IUnitOfWork {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  execute<TResult>(work: () => Promise<TResult>): Promise<TResult>;
  isActive(): boolean;
}
