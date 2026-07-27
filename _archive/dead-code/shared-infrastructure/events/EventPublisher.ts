/**
 * @file EventPublisher.ts
 * @description Reusable publisher responsible for dispatching Domain Events through an EventBus.
 */

import type { IDomainEvent } from '../../domain/base/IDomainEvent.js';
import type { EventBus } from './EventBus.js';

export class EventPublisher {
  private readonly eventBus: EventBus;

  public constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  public async publish<TEvent extends IDomainEvent>(event: TEvent): Promise<void> {
    await this.eventBus.publish(event);
  }

  public async publishAll<TEvent extends IDomainEvent>(events: ReadonlyArray<TEvent>): Promise<void> {
    await this.eventBus.publishMany(events);
  }
}