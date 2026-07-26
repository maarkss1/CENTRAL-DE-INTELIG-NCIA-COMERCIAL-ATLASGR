/**
 * @file InMemoryEventBus.ts
 * @description In-memory EventBus implementation, suitable for tests and single-process deployments.
 */

import type { IDomainEvent } from '../../domain/base/IDomainEvent.js';
import type { EventBus, EventBusMiddleware, EventHandler } from './EventBus.js';

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly middlewares: EventBusMiddleware[] = [];

  public async publish<TEvent extends IDomainEvent>(event: TEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventName);

    const dispatch = async (): Promise<void> => {
      if (!handlers || handlers.size === 0) {
        return;
      }

      await Promise.all(Array.from(handlers).map((handler) => handler(event)));
    };

    const pipeline = this.middlewares.reduceRight<() => Promise<void>>(
      (next, middleware) => () => middleware(event, next),
      dispatch,
    );

    await pipeline();
  }

  public async publishMany<TEvent extends IDomainEvent>(
    events: ReadonlyArray<TEvent>,
  ): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  public subscribe<TEvent extends IDomainEvent>(
    eventName: string,
    handler: EventHandler<TEvent>,
  ): void {
    const existing = this.handlers.get(eventName) ?? new Set<EventHandler>();
    existing.add(handler as EventHandler);
    this.handlers.set(eventName, existing);
  }

  public unsubscribe<TEvent extends IDomainEvent>(
    eventName: string,
    handler: EventHandler<TEvent>,
  ): void {
    this.handlers.get(eventName)?.delete(handler as EventHandler);
  }

  public use(middleware: EventBusMiddleware): void {
    this.middlewares.push(middleware);
  }
}