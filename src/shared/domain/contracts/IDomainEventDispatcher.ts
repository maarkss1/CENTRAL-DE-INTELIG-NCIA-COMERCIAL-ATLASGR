/**
 * @file IDomainEventDispatcher.ts
 * @description Contract for publishing Domain Events, decoupled from any concrete Event Bus.
 */

import type { IDomainEvent } from '../base/IDomainEvent.js';

/**
 * Handler function invoked when a Domain Event is dispatched.
 *
 * @typeParam TEvent - Type of the domain event handled.
 */
export type DomainEventHandler<TEvent extends IDomainEvent = IDomainEvent> = (
  event: TEvent,
) => Promise<void> | void;

/**
 * Contract responsible for publishing Domain Events.
 *
 * Prepared for `dispatch`, `dispatchAll`, `register`, `unregister` and
 * `clearHandlers`. Does not implement a concrete Event Bus.
 */
export interface IDomainEventDispatcher {
  dispatch<TEvent extends IDomainEvent>(event: TEvent): Promise<void>;
  dispatchAll<TEvent extends IDomainEvent>(events: ReadonlyArray<TEvent>): Promise<void>;
  register<TEvent extends IDomainEvent>(
    eventName: string,
    handler: DomainEventHandler<TEvent>,
  ): void;
  unregister<TEvent extends IDomainEvent>(
    eventName: string,
    handler: DomainEventHandler<TEvent>,
  ): void;
  clearHandlers(eventName?: string): void;
}
