import { EventBus } from '../../domain/events/EventBus';
import { DomainEvent } from '../../domain/events/DomainEvent';
import { logger } from '../../../lib/logger';

export class InMemoryEventBus implements EventBus {
  private handlers: Map<string, Array<(event: DomainEvent) => Promise<void>>> = new Map();

  async publish(event: DomainEvent): Promise<void> {
    logger.info({ eventName: event.eventName }, 'Publishing domain event');
    const eventHandlers = this.handlers.get(event.eventName) || [];

    await Promise.all(
      eventHandlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          logger.error({ err: error, eventName: event.eventName }, 'Error handling domain event');
        }
      }),
    );
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  subscribe(eventName: string, handler: (event: DomainEvent) => Promise<void>): void {
    const currentHandlers = this.handlers.get(eventName) || [];
    currentHandlers.push(handler);
    this.handlers.set(eventName, currentHandlers);
  }
}
