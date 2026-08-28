/**
 * @file OrSpecification.ts
 * @description Composite specification that requires at least one child specification to be satisfied.
 */

import { CompositeSpecification } from './CompositeSpecification.js';
import type { Specification } from './Specification.js';

/**
 * Logical OR composition of two or more specifications.
 *
 * @typeParam TCandidate - Type evaluated by the specification.
 */
export class OrSpecification<TCandidate> extends CompositeSpecification<TCandidate> {
  public constructor(...specifications: ReadonlyArray<Specification<TCandidate>>) {
    if (specifications.length === 0) {
      throw new Error('OrSpecification requires at least one specification.');
    }

    super(...specifications);
  }

  public isSatisfiedBy(candidate: TCandidate): boolean {
    return this.children.some((specification) => specification.isSatisfiedBy(candidate));
  }
}
