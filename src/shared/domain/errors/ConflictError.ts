/**
 * @file ConflictError.ts
 * @description Represents a business conflict, such as a duplicate unique value.
 */

import { DomainException, type DomainExceptionDetails } from './DomainException.js';

/**
 * Raised when a business conflict occurs.
 * Example: duplicate email, existing CNPJ, resource already in use.
 */
export class ConflictError extends DomainException {
  public constructor(message: string, details?: DomainExceptionDetails) {
    super(message, 'CONFLICT', details);
  }
}
