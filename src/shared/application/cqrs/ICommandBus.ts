/**
 * @file ICommandBus.ts
 * @description Contract for dispatching Commands to their registered handlers.
 */

import type { ICommand } from './ICommand.js';
import type { CommandResult } from './CommandResult.js';
import type { ICommandHandler } from './ICommandHandler.js';
import type { PipelineBehavior } from './PipelineBehavior.js';
import type { UseCaseContext } from '../base/UseCaseContext.js';

export interface ICommandBus {
  register<TCommand extends ICommand, TValue>(
    commandName: string,
    handler: ICommandHandler<TCommand, TValue>,
  ): void;

  unregister(commandName: string): void;

  useBehavior<TCommand extends ICommand, TValue>(
    behavior: PipelineBehavior<TCommand, TValue>,
  ): void;

  execute<TCommand extends ICommand, TValue>(
    command: TCommand,
    context?: UseCaseContext,
  ): Promise<CommandResult<TValue>>;
}
