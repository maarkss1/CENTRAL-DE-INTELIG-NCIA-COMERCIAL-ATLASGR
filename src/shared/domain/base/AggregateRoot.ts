/**
 * @file AggregateRoot.ts
 * @description Base class for every Aggregate Root, responsible for Domain Event lifecycle.
 */

import { Entity } from './Entity.js';
import type { UniqueEntityID } from './UniqueEntityID.js';
import type { IDomainEvent } from './IDomainEvent.js';

/**
 * Base class reused by every Aggregate Root.
 *
 * Extends {@link Entity} and adds responsibility for registering, exposing,
 * removing and clearing Domain Events, guaranteeing consistency boundaries
 * for the Aggregate.
 *
 * @typeParam TProps - Shape of the aggregate's encapsulated properties.
 * @typeParam TId - Type of the aggregate's identity.
 */
export abstract class AggregateRoot<
  TProps,
  TId extends UniqueEntityID = UniqueEntityID,
> extends Entity<TProps, TId> {
  private domainEvents: IDomainEvent[] = [];

  protected constructor(props: TProps, id: TId) {
    super(props, id);
  }

  /**
   * Read-only view of the Domain Events currently registered on this Aggregate.
   */
  public get events(): ReadonlyArray<IDomainEvent> {
    return [...this.domainEvents];
  }

  /**
   * Registers a new Domain Event raised by this Aggregate.
   */
  protected addDomainEvent(event: IDomainEvent): void {
    this.domainEvents.push(event);
  }

  /**
   * Removes a specific Domain Event previously registered.
   */
  protected removeDomainEvent(event: IDomainEvent): void {
    this.domainEvents = this.domainEvents.filter(
      (registered) => registered.eventId !== event.eventId,
    );
  }

  /**
   * Clears every Domain Event currently registered on this Aggregate.
   * Typically invoked after events have been successfully dispatched.
   */
  public clearEvents(): void {
    this.domainEvents = [];
  }
}
