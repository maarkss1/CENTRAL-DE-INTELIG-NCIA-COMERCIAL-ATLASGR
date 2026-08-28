/**
 * @file AuthorizationBehavior.ts
 * @description Reusable pipeline behavior for request authorization.
 */

import { Result } from '../base/Result.js';
import type { ApplicationError } from '../base/ApplicationError.js';
import type { UseCaseContext } from '../base/UseCaseContext.js';
import type { PipelineBehavior, PipelineNext } from './PipelineBehavior.js';

export type AuthorizationPolicy<TRequest> = (
  request: TRequest,
  context: UseCaseContext,
) => boolean | Promise<boolean>;

export type AuthorizationErrorFactory = () => ApplicationError;

export class AuthorizationBehavior<TRequest, TValue> implements PipelineBehavior<TRequest, TValue> {
  private readonly policies: ReadonlyArray<AuthorizationPolicy<TRequest>>;
  private readonly createError: AuthorizationErrorFactory;

  public constructor(
    policies: ReadonlyArray<AuthorizationPolicy<TRequest>>,
    createError: AuthorizationErrorFactory,
  ) {
    this.policies = policies;
    this.createError = createError;
  }

  public async handle(
    request: TRequest,
    context: UseCaseContext,
    next: PipelineNext<TValue>,
  ): Promise<Result<TValue, ApplicationError>> {
    for (const policy of this.policies) {
      const isAuthorized = await policy(request, context);

      if (!isAuthorized) {
        return Result.fail<TValue, ApplicationError>(this.createError());
      }
    }

    return next();
  }
}
