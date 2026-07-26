/**
 * @file RepositoryFactory.ts
 * @description Reusable factory responsible for constructing Repository instances.
 */

import type { AggregateRoot } from '../../domain/base/AggregateRoot.js';
import type { UniqueEntityID } from '../../domain/base/UniqueEntityID.js';
import type { Repository } from './Repository.js';

export type RepositoryFactoryFn<TAggregate extends AggregateRoot<unknown, UniqueEntityID>> =
  () => Repository<TAggregate>;

export class RepositoryFactory {
  private readonly factories = new Map<string, RepositoryFactoryFn<AggregateRoot<unknown, UniqueEntityID>>>();

  public register<TAggregate extends AggregateRoot<unknown, UniqueEntityID>>(
    token: string,
    factory: RepositoryFactoryFn<TAggregate>,
  ): void {
    this.factories.set(token, factory as RepositoryFactoryFn<AggregateRoot<unknown, UniqueEntityID>>);
  }

  public create<TAggregate extends AggregateRoot<unknown, UniqueEntityID>>(
    token: string,
  ): Repository<TAggregate> {
    const factory = this.factories.get(token);

    if (!factory) {
      throw new Error(`No repository factory registered for token "${token}".`);
    }

    return factory() as Repository<TAggregate>;
  }
}