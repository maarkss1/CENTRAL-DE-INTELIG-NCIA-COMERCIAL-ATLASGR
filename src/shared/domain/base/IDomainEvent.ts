/**
 * @file IDomainEvent.ts
 * @description Contract implemented by every Domain Event.
 */

/**
 * Contract implemented by every Domain Event raised by an Aggregate Root.
 */
export interface IDomainEvent {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly occurredOn: Date;
  readonly eventName: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
