/**
 * @file Command.ts
 * @description Base class for Commands, preparing the ground for CQRS.
 */

/**
 * Base class for every Command in a CQRS-oriented Application layer.
 * A Command represents an intent to change system state.
 *
 * @typeParam TPayload - Shape of the data carried by the command.
 */
export abstract class Command<TPayload> {
  public readonly payload: TPayload;
  public readonly issuedAt: Date;

  protected constructor(payload: TPayload) {
    this.payload = payload;
    this.issuedAt = new Date();
  }
}
