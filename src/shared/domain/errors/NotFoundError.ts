/**
 * @file NotFoundError.ts
 * @description Represents an entity that could not be found.
 */

import { DomainException } from './DomainException.js';

/**
 * Raised when an expected entity or Aggregate could not be found.
 * Prepared for any Aggregate type.
 */
export class NotFoundError extends DomainException {
  public constructor(resource: string, identifier: string) {
    super(`${resource} with identifier "${identifier}" was not found.`, 'NOT_FOUND', {
      resource,
      identifier,
    });
  }
}
