/**
 * @file UnauthorizedError.ts
 * @description Represents an unauthenticated access attempt.
 */

import { DomainException, type DomainExceptionDetails } from './DomainException.js';

/**
 * Raised when an unauthenticated actor attempts to access a protected resource.
 */
export class UnauthorizedError extends DomainException {
  public constructor(
    message = 'Authentication is required to access this resource.',
    details?: DomainExceptionDetails,
  ) {
    super(message, 'UNAUTHORIZED', details);
  }
}
