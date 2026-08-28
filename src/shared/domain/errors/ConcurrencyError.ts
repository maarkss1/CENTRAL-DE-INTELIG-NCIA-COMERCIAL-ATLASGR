/**
 * @file ConcurrencyError.ts
 * @description Represents an optimistic concurrency violation.
 */

import { DomainException } from './DomainException.js';

/**
 * Raised on optimistic concurrency conflicts, versioning mismatches or
 * race conditions detected during persistence operations.
 */
export class ConcurrencyError extends DomainException {
  public constructor(resource: string, expectedVersion: number, actualVersion: number) {
    super(
      `Concurrency conflict on "${resource}": expected version ${expectedVersion}, found ${actualVersion}.`,
      'CONCURRENCY_CONFLICT',
      { resource, expectedVersion, actualVersion },
    );
  }
}
