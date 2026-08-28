/**
 * @file TransactionBehavior.ts
 * @description Reusable pipeline behavior for wrapping request execution in a Unit of Work transaction.
 */

import type { Result } from '../base/Result.js';
import type { ApplicationError } from '../base/ApplicationError.js';
import type { UseCaseContext } from '../base/UseCaseContext.js';
import type { PipelineBehavior, PipelineNext } from './PipelineBehavior.js';
import type { IUnitOfWork } from '../../domain/contracts/IUnitOfWork.js';

export class TransactionBehavior<TRequest, TValue> implements PipelineBehavior<TRequest, TValue> {
  private readonly unitOfWork: IUnitOfWork;

  public constructor(unitOfWork: IUnitOfWork) {
    this.unitOfWork = unitOfWork;
  }

  public async handle(
    _request: TRequest,
    _context: UseCaseContext,
    next: PipelineNext<TValue>,
  ): Promise<Result<TValue, ApplicationError>> {
    return this.unitOfWork.execute(async () => next());
  }
}
