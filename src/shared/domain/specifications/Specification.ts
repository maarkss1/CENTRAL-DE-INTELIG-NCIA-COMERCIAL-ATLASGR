/**
 * @file Specification.ts
 * @description Abstract base class implementing the Specification Pattern.
 */

import { AndSpecification } from './AndSpecification.js';
import { NotSpecification } from './NotSpecification.js';
import { OrSpecification } from './OrSpecification.js';

/**
 * Abstract base class for every Specification.
 *
 * A Specification encapsulates a reusable business rule or predicate that
 * can be evaluated against a candidate object and combined with other
 * Specifications using boolean composition.
 *
 * @typeParam TCandidate - Type evaluated by the specification.
 */
export abstract class Specification<TCandidate> {
  public abstract isSatisfiedBy(candidate: TCandidate): boolean;

  public and(
    ...specifications: ReadonlyArray<Specification<TCandidate>>
  ): Specification<TCandidate> {
    return new AndSpecification<TCandidate>(this, ...specifications);
  }

  public or(
    ...specifications: ReadonlyArray<Specification<TCandidate>>
  ): Specification<TCandidate> {
    return new OrSpecification<TCandidate>(this, ...specifications);
  }

  public not(): Specification<TCandidate> {
    return new NotSpecification<TCandidate>(this);
  }
}
