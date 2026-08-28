/**
 * @file DomainException.ts
 * @description Base class for every exception raised within the Domain layer.
 */

/**
 * Structured, serializable details describing the context of a
 * {@link DomainException}.
 */
export type DomainExceptionDetails = Readonly<Record<string, unknown>>;

/**
 * Plain serialized representation of a {@link DomainException}, suitable
 * for logging, transport or API responses.
 */
export interface SerializedDomainException {
  readonly name: string;
  readonly code: string;
  readonly message: string;
  readonly details: DomainExceptionDetails | undefined;
  readonly timestamp: string;
  readonly cause: string | undefined;
}

/**
 * Base class for all Domain layer exceptions.
 */
export abstract class DomainException extends Error {
  public readonly code: string;
  public readonly details?: DomainExceptionDetails;
  public readonly timestamp: Date;

  protected constructor(
    message: string,
    code: string,
    details?: DomainExceptionDetails,
    cause?: unknown,
  ) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.timestamp = new Date();

    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Serializes this exception into a plain, transport-safe object.
   */
  public toJSON(): SerializedDomainException {
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
