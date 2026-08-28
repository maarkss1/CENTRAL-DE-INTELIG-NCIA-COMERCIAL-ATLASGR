/**
 * @file UseCase.ts
 * @description Abstract base class representing any Use Case, with a full execution pipeline.
 */

import { Result } from './Result.js';
import { ApplicationError } from './ApplicationError.js';
import { UseCaseContext } from './UseCaseContext.js';

/**
 * Generic error raised when a Use Case's `validate` or `authorize` hook fails.
 */
export class UseCaseExecutionError extends ApplicationError {
  public constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super({ code: 'USE_CASE_EXECUTION_ERROR', message, details });
  }
}

/**
 * Abstract base class representing any Use Case.
 *
 * Preparada para: execute, validate, authorize, beforeExecute, afterExecute,
 * rollback hooks, pipeline de execução.
 *
 * @typeParam TInput - Shape of the Use Case input.
 * @typeParam TOutput - Shape of the Use Case output on success.
 */
export abstract class UseCase<TInput, TOutput> {
  /**
   * Runs the full execution pipeline: validate -> authorize -> beforeExecute
   * -> execute -> afterExecute, invoking `rollback` when an unexpected error occurs.
   */
  public async run(
    input: TInput,
    context: UseCaseContext = UseCaseContext.create(),
  ): Promise<Result<TOutput, ApplicationError>> {
    try {
      const validation = await this.validate(input, context);

      if (validation.isFailure()) {
        return Result.fail<TOutput, ApplicationError>(validation.getError());
      }

      const authorization = await this.authorize(input, context);

      if (authorization.isFailure()) {
        return Result.fail<TOutput, ApplicationError>(authorization.getError());
      }

      await this.beforeExecute(input, context);

      const result = await this.execute(input, context);

      await this.afterExecute(input, result, context);

      return result;
    } catch (error) {
      await this.rollback(input, error, context);
      throw error;
    }
  }

  /**
   * Core business logic of the Use Case.
   */
  protected abstract execute(
    input: TInput,
    context: UseCaseContext,
  ): Promise<Result<TOutput, ApplicationError>>;

  /**
   * Validates the input before execution. Defaults to always valid.
   */
  protected async validate(
    _input: TInput,
    _context: UseCaseContext,
  ): Promise<Result<void, ApplicationError>> {
    return Result.ok<void, ApplicationError>(undefined);
  }

  /**
   * Authorizes the actor before execution. Defaults to always authorized.
   */
  protected async authorize(
    _input: TInput,
    _context: UseCaseContext,
  ): Promise<Result<void, ApplicationError>> {
    return Result.ok<void, ApplicationError>(undefined);
  }

  /**
   * Hook invoked immediately before `execute`. Defaults to a no-op.
   */
  protected async beforeExecute(_input: TInput, _context: UseCaseContext): Promise<void> {
    return;
  }

  /**
   * Hook invoked immediately after `execute`. Defaults to a no-op.
   */
  protected async afterExecute(
    _input: TInput,
    _result: Result<TOutput, ApplicationError>,
    _context: UseCaseContext,
  ): Promise<void> {
    return;
  }

  /**
   * Hook invoked when an unexpected error is thrown during the pipeline.
   * Defaults to a no-op, allowing subclasses to implement compensating actions.
   */
  protected async rollback(
    _input: TInput,
    _error: unknown,
    _context: UseCaseContext,
  ): Promise<void> {
    return;
  }
}
