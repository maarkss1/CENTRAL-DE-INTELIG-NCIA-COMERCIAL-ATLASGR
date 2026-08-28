/**
 * @file DomainEvent.ts
 * @description Base class for every concrete Domain Event.
 */

import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from './IDomainEvent.js';

/**
 * Base class implementing {@link IDomainEvent}, reused by every concrete
 * Domain Event raised across the Domain layer.
 */
export abstract class DomainEvent implements IDomainEvent {
  public readonly eventId: string;
  public readonly aggregateId: string;
  public readonly occurredOn: Date;
  public readonly eventName: string;
  public readonly payload: Readonly<Record<string, unknown>>;

  protected constructor(
    aggregateId: string,
    eventName: string,
    payload: Readonly<Record<string, unknown>> = {},
  ) {
    this.eventId = randomUUID();
    this.aggregateId = aggregateId;
    this.occurredOn = new Date();
    this.eventName = eventName;
    this.payload = payload;
  }
}
