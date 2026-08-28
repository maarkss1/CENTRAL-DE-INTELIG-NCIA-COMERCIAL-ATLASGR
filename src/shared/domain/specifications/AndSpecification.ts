/**
 * @file AndSpecification.ts
 * @description Composite specification that requires every child specification to be satisfied.
 */

import { CompositeSpecification } from './CompositeSpecification.js';
import type { Specification } from './Specification.js';

/**
 * Logical AND composition of two or more specifications.
 *
 * @typeParam TCandidate - Type evaluated by the specification.
 */
export class AndSpecification<TCandidate> extends CompositeSpecification<TCandidate> {
  public constructor(...specifications: ReadonlyArray<Specification<TCandidate>>) {
    if (specifications.length === 0) {
      throw new Error('AndSpecification requires at least one specification.');
    }

    super(...specifications);
  }

  public isSatisfiedBy(candidate: TCandidate): boolean {
    return this.children.every((specification) => specification.isSatisfiedBy(candidate));
  }
}
