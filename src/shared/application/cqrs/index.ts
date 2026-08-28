/**
 * @file index.ts
 * @description Public API surface of the CQRS Application layer.
 */

export type { ICommand } from './ICommand.js';
export type { IQuery } from './IQuery.js';
export type { CommandResult } from './CommandResult.js';
export type { QueryResult } from './QueryResult.js';
export type { ICommandHandler } from './ICommandHandler.js';
export type { IQueryHandler } from './IQueryHandler.js';
export { CommandHandler } from './CommandHandler.js';
export { QueryHandler } from './QueryHandler.js';
export type { ICommandBus } from './ICommandBus.js';
export type { IQueryBus } from './IQueryBus.js';
export {
  CommandBus,
  CommandHandlerNotFoundError,
  DuplicateCommandHandlerError,
} from './CommandBus.js';
export { QueryBus, QueryHandlerNotFoundError, DuplicateQueryHandlerError } from './QueryBus.js';
export type { PipelineBehavior, PipelineNext } from './PipelineBehavior.js';
export { LoggingBehavior, type LoggingBehaviorLogger } from './LoggingBehavior.js';
export {
  ValidationBehavior,
  type ValidationRule,
  type ValidationErrorFactory,
} from './ValidationBehavior.js';
export {
  AuthorizationBehavior,
  type AuthorizationPolicy,
  type AuthorizationErrorFactory,
} from './AuthorizationBehavior.js';
export { TransactionBehavior } from './TransactionBehavior.js';
export {
  CachingBehavior,
  type CachingBehaviorStore,
  type CacheKeyResolver,
} from './CachingBehavior.js';
