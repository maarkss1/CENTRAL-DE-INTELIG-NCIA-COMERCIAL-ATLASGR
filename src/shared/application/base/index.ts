/**
 * @file index.ts
 * @description Public API surface of the Application base layer.
 */

export {
  ApplicationError,
  type ApplicationErrorDetails,
  type SerializedApplicationError,
} from './ApplicationError.js';
export {
  Result,
  type ResultMapper,
  type ResultFlatMapper,
  type ResultMatchers,
  type ApplicationErrorLike,
} from './Result.js';
export { Either, Left, Right } from './Either.js';
export { UseCase, UseCaseExecutionError } from './UseCase.js';
export { Command } from './Command.js';
export { Query } from './Query.js';
export { UseCaseContext, type UseCaseUser, type UseCaseTenant } from './UseCaseContext.js';
export { PaginatedResult } from './PaginatedResult.js';
export { Pagination, type PaginationSort, type PaginationSortDirection } from './Pagination.js';
export {
  ExecutionContext,
  type ExecutionContextLogger,
  type ExecutionContextMetrics,
} from './ExecutionContext.js';
