/**
 * @file EventRegistry.ts
 * @description Reusable registry binding EventSubscribers to an EventBus.
 */

import type { IDomainEvent } from '../../domain/base/IDomainEvent.js';
import type { EventBus } from './EventBus.js';
import type { EventSubscriber } from './EventSubscriber.js';

export class EventRegistry {
  private readonly eventBus: EventBus;
  private readonly subscribers: EventSubscriber[] = [];

  public constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  public register<TEvent extends IDomainEvent>(subscriber: EventSubscriber<TEvent>): void {
    this.subscribers.push(subscriber as EventSubscriber);
    this.eventBus.subscribe(subscriber.eventName, (event: IDomainEvent) =>
      subscriber.handle(event as TEvent),
    );
  }

  public registerMany(subscribers: ReadonlyArray<EventSubscriber>): void {
    subscribers.forEach((subscriber) => this.register(subscriber));
  }

  public getRegisteredSubscribers(): ReadonlyArray<EventSubscriber> {
    return [...this.subscribers];
  }
}