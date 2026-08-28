/**
 * @file ExpressionSpecification.ts
 * @description Specification built from a function/lambda expression.
 */

import { Specification } from './Specification.js';

/**
 * Predicate function evaluated by an {@link ExpressionSpecification}.
 *
 * @typeParam TCandidate - Type evaluated by the specification.
 */
export type SpecificationExpression<TCandidate> = (candidate: TCandidate) => boolean;

/**
 * Specification built from a lambda/function expression.
 *
 * @typeParam TCandidate - Type evaluated by the specification.
 */
export class ExpressionSpecification<TCandidate> extends Specification<TCandidate> {
  private readonly expression: SpecificationExpression<TCandidate>;

  public constructor(expression: SpecificationExpression<TCandidate>) {
    super();
    this.expression = expression;
  }

  public isSatisfiedBy(candidate: TCandidate): boolean {
    return this.expression(candidate);
  }
}
