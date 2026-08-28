/**
 * @file ICommand.ts
 * @description Marker interface for CQRS Commands.
 */

export interface ICommand {
  readonly commandName: string;
}
