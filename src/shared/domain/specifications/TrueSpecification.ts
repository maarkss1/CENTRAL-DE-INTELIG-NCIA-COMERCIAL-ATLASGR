/**
 * @file TrueSpecification.ts
 * @description Specification that is always satisfied.
 */

import { Specification } from './Specification.js';

/**
 * Specification that always evaluates to true.
 *
 * @typeParam TCandidate - Type evaluated by the specification.
 */
export class TrueSpecification<TCandidate> extends Specification<TCandidate> {
  public isSatisfiedBy(_candidate: TCandidate): boolean {
    return true;
  }
}
