/**
 * @file NotSpecification.ts
 * @description Composite specification that inverts the result of another specification.
 */

import { CompositeSpecification } from './CompositeSpecification.js';
import type { Specification } from './Specification.js';

/**
 * Logical NOT composition of a single specification.
 *
 * @typeParam TCandidate - Type evaluated by the specification.
 */
export class NotSpecification<TCandidate> extends CompositeSpecification<TCandidate> {
  public constructor(specification: Specification<TCandidate>) {
    super(specification);
  }

  public isSatisfiedBy(candidate: TCandidate): boolean {
    const [specification] = this.children;
    return !specification.isSatisfiedBy(candidate);
  }
}
