/**
 * @file EventSubscriber.ts
 * @description Contract for consumers reacting to Domain Events.
 */

import type { IDomainEvent } from '../../domain/base/IDomainEvent.js';

export interface EventSubscriber<TEvent extends IDomainEvent = IDomainEvent> {
  readonly eventName: string;
  handle(event: TEvent): Promise<void> | void;
}