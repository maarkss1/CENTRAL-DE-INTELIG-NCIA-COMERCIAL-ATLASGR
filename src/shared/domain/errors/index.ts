/**
 * @file index.ts
 * @description Public API surface of the Domain errors layer.
 */

export {
  DomainException,
  type DomainExceptionDetails,
  type SerializedDomainException,
} from './DomainException.js';
export { BusinessRuleValidationError } from './BusinessRuleValidationError.js';
export { ValidationError, type ValidationFailure } from './ValidationError.js';
export { NotFoundError } from './NotFoundError.js';
export { ConflictError } from './ConflictError.js';
export { ConcurrencyError } from './ConcurrencyError.js';
export { UnauthorizedError } from './UnauthorizedError.js';
export { ForbiddenError } from './ForbiddenError.js';
