/**
 * @file EventBus.ts
 * @description Contract for a decoupled Event Bus supporting publish/subscribe semantics.
 */

import type { IDomainEvent } from '../../domain/base/IDomainEvent.js';

export type EventHandler<TEvent extends IDomainEvent = IDomainEvent> = (
  event: TEvent,
) => Promise<void> | void;

export type EventBusMiddleware = (
  event: IDomainEvent,
  next: () => Promise<void>,
) => Promise<void>;

/**
 * Contract for a decoupled Event Bus.
 * Preparada para: Publish, PublishMany, Subscribe, Unsubscribe, Handlers, Middlewares.
 */
export interface EventBus {
  publish<TEvent extends IDomainEvent>(event: TEvent): Promise<void>;
  publishMany<TEvent extends IDomainEvent>(events: ReadonlyArray<TEvent>): Promise<void>;
  subscribe<TEvent extends IDomainEvent>(eventName: string, handler: EventHandler<TEvent>): void;
  unsubscribe<TEvent extends IDomainEvent>(eventName: string, handler: EventHandler<TEvent>): void;
  use(middleware: EventBusMiddleware): void;
}