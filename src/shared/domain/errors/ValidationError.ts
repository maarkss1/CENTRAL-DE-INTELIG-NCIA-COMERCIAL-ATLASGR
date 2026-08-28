/**
 * @file ValidationError.ts
 * @description Represents one or more validation failures.
 */

import { DomainException } from './DomainException.js';

/**
 * A single field-level validation failure.
 */
export interface ValidationFailure {
  readonly field: string;
  readonly message: string;
}

/**
 * Raised when input data fails validation.
 *
 * Prepared to carry multiple failures, compatible with future integration
 * with schema validation libraries such as Zod.
 */
export class ValidationError extends DomainException {
  public readonly failures: ReadonlyArray<ValidationFailure>;

  public constructor(failures: ReadonlyArray<ValidationFailure>) {
    super('One or more validation errors occurred.', 'VALIDATION_ERROR', { failures });
    this.failures = failures;
  }
}
