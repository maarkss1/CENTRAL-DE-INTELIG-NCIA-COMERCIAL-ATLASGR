/**
 * @file PipelineBehavior.ts
 * @description Contract for pipeline middleware behaviors applied to Command/Query execution.
 */

import type { Result } from '../base/Result.js';
import type { ApplicationError } from '../base/ApplicationError.js';
import type { UseCaseContext } from '../base/UseCaseContext.js';

export type PipelineNext<TValue> = () => Promise<Result<TValue, ApplicationError>>;

export interface PipelineBehavior<TRequest, TValue> {
  handle(
    request: TRequest,
    context: UseCaseContext,
    next: PipelineNext<TValue>,
  ): Promise<Result<TValue, ApplicationError>>;
}
