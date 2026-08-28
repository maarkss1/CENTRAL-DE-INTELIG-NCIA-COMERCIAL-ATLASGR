/**
 * @file ForbiddenError.ts
 * @description Represents an unauthorized (forbidden) access attempt.
 */

import { DomainException, type DomainExceptionDetails } from './DomainException.js';

/**
 * Raised when an authenticated actor lacks permission to access a resource.
 */
export class ForbiddenError extends DomainException {
  public constructor(
    message = 'You do not have permission to perform this action.',
    details?: DomainExceptionDetails,
  ) {
    super(message, 'FORBIDDEN', details);
  }
}
