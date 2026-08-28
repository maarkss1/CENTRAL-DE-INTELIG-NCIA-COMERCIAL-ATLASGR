/**
 * @file CompositeSpecification.ts
 * @description Abstract base class for specifications composed from one or more children.
 */

import { Specification } from './Specification.js';

/**
 * Abstract base class for composite specifications.
 *
 * @typeParam TCandidate - Type evaluated by the specification.
 */
export abstract class CompositeSpecification<TCandidate> extends Specification<TCandidate> {
  private readonly specifications: ReadonlyArray<Specification<TCandidate>>;

  protected constructor(...specifications: ReadonlyArray<Specification<TCandidate>>) {
    super();
    this.specifications = [...specifications];
  }

  protected get children(): ReadonlyArray<Specification<TCandidate>> {
    return this.specifications;
  }
}
