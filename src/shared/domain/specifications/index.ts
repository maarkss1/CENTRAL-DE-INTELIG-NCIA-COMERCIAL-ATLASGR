/**
 * @file index.ts
 * @description Public API surface of the Domain specifications layer.
 */

export { Specification } from './Specification.js';
export { CompositeSpecification } from './CompositeSpecification.js';
export { AndSpecification } from './AndSpecification.js';
export { OrSpecification } from './OrSpecification.js';
export { NotSpecification } from './NotSpecification.js';
export { TrueSpecification } from './TrueSpecification.js';
export { FalseSpecification } from './FalseSpecification.js';
export {
  ExpressionSpecification,
  type SpecificationExpression,
} from './ExpressionSpecification.js';
