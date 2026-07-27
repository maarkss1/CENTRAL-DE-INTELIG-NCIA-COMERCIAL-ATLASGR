/**
 * @file Transaction.ts
 * @description Reusable abstraction representing an active transaction boundary.
 */

export interface Transaction {
  readonly id: string;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  isActive(): boolean;
}

export interface TransactionFactory {
  begin(): Promise<Transaction>;
}