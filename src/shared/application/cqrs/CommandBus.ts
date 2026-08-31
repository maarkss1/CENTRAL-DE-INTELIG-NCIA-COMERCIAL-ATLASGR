/**
 * @file CommandBus.ts
 * @description Reusable in-process implementation of ICommandBus.
 */

import { Result } from '../base/Result.js';
import { ApplicationError } from '../base/ApplicationError.js';
import { UseCaseContext } from '../base/UseCaseContext.js';
import type { ICommand } from './ICommand.js';
import type { CommandResult } from './CommandResult.js';
import type { ICommandHandler } from './ICommandHandler.js';
import type { ICommandBus } from './ICommandBus.js';
import type { PipelineBehavior, PipelineNext } from './PipelineBehavior.js';

export class CommandHandlerNotFoundError extends ApplicationError {
  public constructor(commandName: string) {
    super({
      code: 'COMMAND_HANDLER_NOT_FOUND',
      message: `No handler registered for command "${commandName}".`,
      details: { commandName },
    });
  }
}

export class DuplicateCommandHandlerError extends ApplicationError {
  public constructor(commandName: string) {
    super({
      code: 'DUPLICATE_COMMAND_HANDLER',
      message: `A handler is already registered for command "${commandName}".`,
      details: { commandName },
    });
  }
}

/**
 * Reusable in-process Command Bus implementation.
 * Preparado para: registro de handlers, pipeline de middlewares, execução,
 * tratamento de erros e extensão futura.
 */
export class CommandBus implements ICommandBus {
  private readonly handlers = new Map<string, ICommandHandler<ICommand, unknown>>();
  private readonly behaviors: Array<PipelineBehavior<ICommand, unknown>> = [];

  public register<TCommand extends ICommand, TValue>(
    commandName: string,
    handler: ICommandHandler<TCommand, TValue>,
  ): void {
    if (this.handlers.has(commandName)) {
      throw new DuplicateCommandHandlerError(commandName);
    }

    this.handlers.set(commandName, handler as unknown as ICommandHandler<ICommand, unknown>);
  }

  public unregister(commandName: string): void {
    this.handlers.delete(commandName);
  }

  public useBehavior<TCommand extends ICommand, TValue>(
    behavior: PipelineBehavior<TCommand, TValue>,
  ): void {
    this.behaviors.push(behavior as unknown as PipelineBehavior<ICommand, unknown>);
  }

  public async execute<TCommand extends ICommand, TValue>(
    command: TCommand,
    context: UseCaseContext = UseCaseContext.create(),
  ): Promise<CommandResult<TValue>> {
    const handler = this.handlers.get(command.commandName) as
      | ICommandHandler<TCommand, TValue>
      | undefined;

    if (!handler) {
      return Result.fail<TValue, ApplicationError>(
        new CommandHandlerNotFoundError(command.commandName),
      );
    }

    const pipeline = this.buildPipeline<TCommand, TValue>(handler, context);

    return pipeline(command);
  }

  private buildPipeline<TCommand extends ICommand, TValue>(
    handler: ICommandHandler<TCommand, TValue>,
    context: UseCaseContext,
  ): (command: TCommand) => Promise<CommandResult<TValue>> {
    return async (command: TCommand): Promise<CommandResult<TValue>> => {
      const executeHandler: PipelineNext<TValue> = () => handler.handle(command, context);

      const chain = this.behaviors.reduceRight<PipelineNext<TValue>>(
        (next, behavior) => () =>
          (behavior as unknown as PipelineBehavior<TCommand, TValue>).handle(
            command,
            context,
            next,
          ),
        executeHandler,
      );

      return chain();
    };
  }
}
