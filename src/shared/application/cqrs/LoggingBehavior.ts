/**
 * @file LoggingBehavior.ts
 * @description Reusable pipeline behavior for structured logging around request execution.
 */

import type { Result } from '../base/Result.js';
import type { ApplicationError } from '../base/ApplicationError.js';
import type { UseCaseContext } from '../base/UseCaseContext.js';
import type { PipelineBehavior, PipelineNext } from './PipelineBehavior.js';

export interface LoggingBehaviorLogger {
  info(message: string, meta?: Readonly<Record<string, unknown>>): void;
  error(message: string, meta?: Readonly<Record<string, unknown>>): void;
}

export class LoggingBehavior<
  TRequest extends { readonly commandName?: string; readonly queryName?: string },
  TValue,
> implements PipelineBehavior<TRequest, TValue> {
  private readonly logger: LoggingBehaviorLogger;

  public constructor(logger: LoggingBehaviorLogger) {
    this.logger = logger;
  }

  public async handle(
    request: TRequest,
    context: UseCaseContext,
    next: PipelineNext<TValue>,
  ): Promise<Result<TValue, ApplicationError>> {
    const requestName = request.commandName ?? request.queryName ?? 'UnknownRequest';
    const startedAt = Date.now();

    this.logger.info(`Executing ${requestName}`, {
      correlationId: context.correlationId,
      requestId: context.requestId,
    });

    const result = await next();
    const durationMs = Date.now() - startedAt;

    if (result.isFailure()) {
      this.logger.error(`Failed ${requestName}`, {
        correlationId: context.correlationId,
        requestId: context.requestId,
        durationMs,
        error: result.getError(),
      });
    } else {
      this.logger.info(`Completed ${requestName}`, {
        correlationId: context.correlationId,
        requestId: context.requestId,
        durationMs,
      });
    }

    return result;
  }
}
