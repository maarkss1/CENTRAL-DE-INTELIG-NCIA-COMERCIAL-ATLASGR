/**
 * @file Result.ts
 * @description Complete implementation of the Result Pattern.
 */

export type ResultMapper<TValue, TMapped> = (value: TValue) => TMapped;

export type ResultFlatMapper<TValue, TMapped, TError> = (value: TValue) => Result<TMapped, TError>;

export interface ResultMatchers<TValue, TError, TOutput> {
  readonly onSuccess: (value: TValue) => TOutput;
  readonly onFailure: (error: TError) => TOutput;
}

/**
 * Implementation of the Result Pattern, representing the outcome of an
 * operation that may either succeed with a value or fail with an error.
 *
 * @typeParam TValue - Type of the value held on success.
 * @typeParam TError - Type of the error held on failure.
 */
export class Result<TValue, TError = ApplicationErrorLike> {
  private readonly success: boolean;
  private readonly value?: TValue;
  private readonly error?: TError;

  private constructor(success: boolean, value?: TValue, error?: TError) {
    this.success = success;
    this.value = value;
    this.error = error;
  }

  public static ok<TValue, TError = ApplicationErrorLike>(value: TValue): Result<TValue, TError> {
    return new Result<TValue, TError>(true, value, undefined);
  }

  public static fail<TValue = never, TError = ApplicationErrorLike>(
    error: TError,
  ): Result<TValue, TError> {
    return new Result<TValue, TError>(false, undefined, error);
  }

  public isSuccess(): boolean {
    return this.success;
  }

  public isFailure(): boolean {
    return !this.success;
  }

  public getValue(): TValue {
    if (!this.success) {
      throw new Error('Cannot retrieve the value of a failed Result.');
    }

    return this.value as TValue;
  }

  public getError(): TError {
    if (this.success) {
      throw new Error('Cannot retrieve the error of a successful Result.');
    }

    return this.error as TError;
  }

  public map<TMapped>(mapper: ResultMapper<TValue, TMapped>): Result<TMapped, TError> {
    if (this.isFailure()) {
      return Result.fail<TMapped, TError>(this.error as TError);
    }

    return Result.ok<TMapped, TError>(mapper(this.value as TValue));
  }

  public flatMap<TMapped>(
    mapper: ResultFlatMapper<TValue, TMapped, TError>,
  ): Result<TMapped, TError> {
    if (this.isFailure()) {
      return Result.fail<TMapped, TError>(this.error as TError);
    }

    return mapper(this.value as TValue);
  }

  public match<TOutput>(matchers: ResultMatchers<TValue, TError, TOutput>): TOutput {
    return this.success
      ? matchers.onSuccess(this.value as TValue)
      : matchers.onFailure(this.error as TError);
  }

  public getValueOrDefault(fallback: TValue): TValue {
    return this.success ? (this.value as TValue) : fallback;
  }

  public static combine<TValue, TError = ApplicationErrorLike>(
    results: ReadonlyArray<Result<TValue, TError>>,
  ): Result<ReadonlyArray<TValue>, TError> {
    const values: TValue[] = [];

    for (const result of results) {
      if (result.isFailure()) {
        return Result.fail<ReadonlyArray<TValue>, TError>(result.getError());
      }

      values.push(result.getValue());
    }

    return Result.ok<ReadonlyArray<TValue>, TError>(values);
  }
}

/**
 * Minimal shape used as the default error type parameter, avoiding a hard
 * dependency on any concrete error class.
 */
export type ApplicationErrorLike = Error;
