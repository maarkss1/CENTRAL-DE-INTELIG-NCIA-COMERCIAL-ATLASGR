/**
 * @file QueryHandler.ts
 * @description Abstract base class reused by every concrete Query handler.
 */

import type { IQuery } from './IQuery.js';
import type { QueryResult } from './QueryResult.js';
import type { IQueryHandler } from './IQueryHandler.js';
import type { UseCaseContext } from '../base/UseCaseContext.js';

export abstract class QueryHandler<
  TQuery extends IQuery<TResult>,
  TResult,
> implements IQueryHandler<TQuery, TResult> {
  public abstract handle(query: TQuery, context?: UseCaseContext): Promise<QueryResult<TResult>>;
}
