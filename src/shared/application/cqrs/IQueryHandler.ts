/**
 * @file IQueryHandler.ts
 * @description Contract for Query handlers.
 */

import type { IQuery } from './IQuery.js';
import type { QueryResult } from './QueryResult.js';
import type { UseCaseContext } from '../base/UseCaseContext.js';

export interface IQueryHandler<TQuery extends IQuery<TResult>, TResult> {
  handle(query: TQuery, context?: UseCaseContext): Promise<QueryResult<TResult>>;
}
