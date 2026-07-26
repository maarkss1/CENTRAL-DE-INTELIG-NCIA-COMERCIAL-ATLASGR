/**
 * @file UnitOfWork.ts
 * @description Reusable Unit of Work implementation coordinating transactional execution.
 */

import type { IUnitOfWork } from '../../domain/contracts/IUnitOfWork.js';
import type { Transaction, TransactionFactory } from './Transaction.js';

/**
 * Reusable implementation of IUnitOfWork.
 * Preparada para transações, sem depender de nenhum driver de banco concreto.
 */
export class UnitOfWork implements IUnitOfWork {
  private readonly transactionFactory: TransactionFactory;
  private activeTransaction: Transaction | undefined;

  public constructor(transactionFactory: TransactionFactory) {
    this.transactionFactory = transactionFactory;
  }

  public async begin(): Promise<void> {
    this.activeTransaction = await this.transactionFactory.begin();
  }

  public async commit(): Promise<void> {
    if (!this.activeTransaction) {
      throw new Error('Cannot commit: no active transaction.');
    }

    await this.activeTransaction.commit();
    this.activeTransaction = undefined;
  }

  public async rollback(): Promise<void> {
    if (!this.activeTransaction) {
      throw new Error('Cannot rollback: no active transaction.');
    }

    await this.activeTransaction.rollback();
    this.activeTransaction = undefined;
  }

  public async execute<TResult>(work: () => Promise<TResult>): Promise<TResult> {
    await this.begin();

    try {
      const result = await work();
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  public isActive(): boolean {
    return this.activeTransaction?.isActive() ?? false;
  }
}