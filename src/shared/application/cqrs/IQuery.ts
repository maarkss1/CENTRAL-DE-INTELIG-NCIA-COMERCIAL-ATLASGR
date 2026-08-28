/**
 * @file IQuery.ts
 * @description Marker interface for CQRS Queries.
 */

export interface IQuery<TResult> {
  readonly queryName: string;
  readonly __resultType?: TResult;
}
