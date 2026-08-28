/**
 * @file FalseSpecification.ts
 * @description Specification that is never satisfied.
 */

import { Specification } from './Specification.js';

/**
 * Specification that always evaluates to false.
 *
 * @typeParam TCandidate - Type evaluated by the specification.
 */
export class FalseSpecification<TCandidate> extends Specification<TCandidate> {
  public isSatisfiedBy(_candidate: TCandidate): boolean {
    return false;
  }
}
