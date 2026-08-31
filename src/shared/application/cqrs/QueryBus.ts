/**
 * @file QueryBus.ts
 * @description Reusable in-process implementation of IQueryBus.
 */

import { Result } from '../base/Result.js';
import { ApplicationError } from '../base/ApplicationError.js';
import { UseCaseContext } from '../base/UseCaseContext.js';
import type { IQuery } from './IQuery.js';
import type { QueryResult } from './QueryResult.js';
import type { IQueryHandler } from './IQueryHandler.js';
import type { IQueryBus } from './IQueryBus.js';
import type { PipelineBehavior, PipelineNext } from './PipelineBehavior.js';

export class QueryHandlerNotFoundError extends ApplicationError {
  public constructor(queryName: string) {
    super({
      code: 'QUERY_HANDLER_NOT_FOUND',
      message: `No handler registered for query "${queryName}".`,
      details: { queryName },
    });
  }
}

export class DuplicateQueryHandlerError extends ApplicationError {
  public constructor(queryName: string) {
    super({
      code: 'DUPLICATE_QUERY_HANDLER',
      message: `A handler is already registered for query "${queryName}".`,
      details: { queryName },
    });
  }
}

/**
 * Reusable in-process Query Bus implementation. Mesmo padrão do CommandBus.
 */
export class QueryBus implements IQueryBus {
  private readonly handlers = new Map<string, IQueryHandler<IQuery<unknown>, unknown>>();
  private readonly behaviors: Array<PipelineBehavior<IQuery<unknown>, unknown>> = [];

  public register<TQuery extends IQuery<TResult>, TResult>(
    queryName: string,
    handler: IQueryHandler<TQuery, TResult>,
  ): void {
    if (this.handlers.has(queryName)) {
      throw new DuplicateQueryHandlerError(queryName);
    }

    this.handlers.set(queryName, handler as unknown as IQueryHandler<IQuery<unknown>, unknown>);
  }

  public unregister(queryName: string): void {
    this.handlers.delete(queryName);
  }

  public useBehavior<TQuery extends IQuery<TResult>, TResult>(
    behavior: PipelineBehavior<TQuery, TResult>,
  ): void {
    this.behaviors.push(behavior as unknown as PipelineBehavior<IQuery<unknown>, unknown>);
  }

  public async execute<TQuery extends IQuery<TResult>, TResult>(
    query: TQuery,
    context: UseCaseContext = UseCaseContext.create(),
  ): Promise<QueryResult<TResult>> {
    const handler = this.handlers.get(query.queryName) as
      | IQueryHandler<TQuery, TResult>
      | undefined;

    if (!handler) {
      return Result.fail<TResult, ApplicationError>(new QueryHandlerNotFoundError(query.queryName));
    }

    const pipeline = this.buildPipeline<TQuery, TResult>(handler, context);

    return pipeline(query);
  }

  private buildPipeline<TQuery extends IQuery<TResult>, TResult>(
    handler: IQueryHandler<TQuery, TResult>,
    context: UseCaseContext,
  ): (query: TQuery) => Promise<QueryResult<TResult>> {
    return async (query: TQuery): Promise<QueryResult<TResult>> => {
      const executeHandler: PipelineNext<TResult> = () => handler.handle(query, context);

      const chain = this.behaviors.reduceRight<PipelineNext<TResult>>(
        (next, behavior) => () =>
          (behavior as unknown as PipelineBehavior<TQuery, TResult>).handle(query, context, next),
        executeHandler,
      );

      return chain();
    };
  }
}
