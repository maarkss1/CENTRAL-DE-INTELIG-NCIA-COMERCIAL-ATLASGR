/**
 * @file ICommandHandler.ts
 * @description Contract for Command handlers.
 */

import type { ICommand } from './ICommand.js';
import type { CommandResult } from './CommandResult.js';
import type { UseCaseContext } from '../base/UseCaseContext.js';

export interface ICommandHandler<TCommand extends ICommand, TValue> {
  handle(command: TCommand, context?: UseCaseContext): Promise<CommandResult<TValue>>;
}
