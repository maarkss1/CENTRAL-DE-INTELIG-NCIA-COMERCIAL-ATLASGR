/**
 * @file CommandHandler.ts
 * @description Abstract base class reused by every concrete Command handler.
 */

import type { ICommand } from './ICommand.js';
import type { CommandResult } from './CommandResult.js';
import type { ICommandHandler } from './ICommandHandler.js';
import type { UseCaseContext } from '../base/UseCaseContext.js';

export abstract class CommandHandler<TCommand extends ICommand, TValue>
  implements ICommandHandler<TCommand, TValue>
{
  public abstract handle(
    command: TCommand,
    context?: UseCaseContext,
  ): Promise<CommandResult<TValue>>;
}
