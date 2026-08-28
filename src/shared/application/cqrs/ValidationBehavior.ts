/**
 * @file ValidationBehavior.ts
 * @description Reusable pipeline behavior for request validation.
 */

import { Result } from '../base/Result.js';
import type { ApplicationError } from '../base/ApplicationError.js';
import type { UseCaseContext } from '../base/UseCaseContext.js';
import type { PipelineBehavior, PipelineNext } from './PipelineBehavior.js';

export type ValidationRule<TRequest> = (request: TRequest) => ReadonlyArray<string>;

export type ValidationErrorFactory = (errors: ReadonlyArray<string>) => ApplicationError;

export class ValidationBehavior<TRequest, TValue> implements PipelineBehavior<TRequest, TValue> {
  private readonly rules: ReadonlyArray<ValidationRule<TRequest>>;
  private readonly createError: ValidationErrorFactory;

  public constructor(
    rules: ReadonlyArray<ValidationRule<TRequest>>,
    createError: ValidationErrorFactory,
  ) {
    this.rules = rules;
    this.createError = createError;
  }

  public async handle(
    request: TRequest,
    _context: UseCaseContext,
    next: PipelineNext<TValue>,
  ): Promise<Result<TValue, ApplicationError>> {
    const errors = this.rules.flatMap((rule) => rule(request));

    if (errors.length > 0) {
      return Result.fail<TValue, ApplicationError>(this.createError(errors));
    }

    return next();
  }
}
