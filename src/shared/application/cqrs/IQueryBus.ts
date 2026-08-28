/**
 * @file IQueryBus.ts
 * @description Contract for dispatching Queries to their registered handlers.
 */

import type { IQuery } from './IQuery.js';
import type { QueryResult } from './QueryResult.js';
import type { IQueryHandler } from './IQueryHandler.js';
import type { PipelineBehavior } from './PipelineBehavior.js';
import type { UseCaseContext } from '../base/UseCaseContext.js';

export interface IQueryBus {
  register<TQuery extends IQuery<TResult>, TResult>(
    queryName: string,
    handler: IQueryHandler<TQuery, TResult>,
  ): void;

  unregister(queryName: string): void;

  useBehavior<TQuery extends IQuery<TResult>, TResult>(
    behavior: PipelineBehavior<TQuery, TResult>,
  ): void;

  execute<TQuery extends IQuery<TResult>, TResult>(
    query: TQuery,
    context?: UseCaseContext,
  ): Promise<QueryResult<TResult>>;
}
