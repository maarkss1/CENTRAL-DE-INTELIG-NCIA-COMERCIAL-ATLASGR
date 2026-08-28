/**
 * @file ApplicationError.ts
 * @description Base class for every exception raised within the Application layer.
 */

export type ApplicationErrorDetails = Readonly<Record<string, unknown>>;

export interface SerializedApplicationError {
  readonly name: string;
  readonly code: string;
  readonly message: string;
  readonly details: ApplicationErrorDetails | undefined;
  readonly timestamp: string;
  readonly cause: string | undefined;
}

/**
 * Base class for all Application layer errors.
 * Compatible with DomainException in shape (code, message, cause, details, timestamp).
 */
export abstract class ApplicationError extends Error {
  public readonly code: string;
  public readonly details?: ApplicationErrorDetails;
  public readonly timestamp: Date;

  protected constructor(input: {
    readonly code: string;
    readonly message: string;
    readonly details?: ApplicationErrorDetails;
    readonly cause?: unknown;
  }) {
    super(input.message, input.cause !== undefined ? { cause: input.cause } : undefined);
    this.name = this.constructor.name;
    this.code = input.code;
    this.details = input.details;
    this.timestamp = new Date();

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toJSON(): SerializedApplicationError {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
      cause: this.cause instanceof Error ? this.cause.message : undefined,
    };
  }
}
