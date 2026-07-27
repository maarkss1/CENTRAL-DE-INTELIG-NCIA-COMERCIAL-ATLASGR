/**
 * @file BaseRepository.ts
 * @description Abstract reusable Repository implementation, ready for future ORM/database adapters.
 */

import type { AggregateRoot } from '../../domain/base/AggregateRoot.js';
import type { UniqueEntityID } from '../../domain/base/UniqueEntityID.js';
import type { IRepository } from '../../domain/contracts/IRepository.js';
import type {
  FindAllOptions,
  PaginatedQueryResult,
  PaginatedQueryOptions,
} from '../../domain/contracts/IReadRepository.js';

export interface PersistenceGateway<TAggregate extends AggregateRoot<unknown, UniqueEntityID>, TId> {
  findById(id: TId): Promise<TAggregate | null>;
  findAll(options?: FindAllOptions<TAggregate>): Promise<ReadonlyArray<TAggregate>>;
  findPaginated(options: PaginatedQueryOptions<TAggregate>): Promise<PaginatedQueryResult<TAggregate>>;
  exists(id: TId): Promise<boolean>;
  count(options?: FindAllOptions<TAggregate>): Promise<number>;
  create(aggregate: TAggregate): Promise<void>;
  update(aggregate: TAggregate): Promise<void>;
  delete(id: TId): Promise<void>;
  save(aggregate: TAggregate): Promise<void>;
  createMany(aggregates: ReadonlyArray<TAggregate>): Promise<void>;
  updateMany(aggregates: ReadonlyArray<TAggregate>): Promise<void>;
  deleteMany(ids: ReadonlyArray<TId>): Promise<void>;
}

/**
 * Abstract base Repository implementation reused by every concrete Repository.
 * Delegates persistence operations to an injected PersistenceGateway, keeping
 * the Domain and Application layers decoupled from any concrete database.
 */
export abstract class BaseRepository<TAggregate extends AggregateRoot<unknown, UniqueEntityID>, TId>
  implements IRepository<TAggregate, TId>
{
  protected constructor(protected readonly gateway: PersistenceGateway<TAggregate, TId>) {}

  public findById(id: TId): Promise<TAggregate | null> {
    return this.gateway.findById(id);
  }

  public findAll(options?: FindAllOptions<TAggregate>): Promise<ReadonlyArray<TAggregate>> {
    return this.gateway.findAll(options);
  }

  public findPaginated(
    options: PaginatedQueryOptions<TAggregate>,
  ): Promise<PaginatedQueryResult<TAggregate>> {
    return this.gateway.findPaginated(options);
  }

  public exists(id: TId): Promise<boolean> {
    return this.gateway.exists(id);
  }

  public count(options?: FindAllOptions<TAggregate>): Promise<number> {
    return this.gateway.count(options);
  }

  public create(aggregate: TAggregate): Promise<void> {
    return this.gateway.create(aggregate);
  }

  public update(aggregate: TAggregate): Promise<void> {
    return this.gateway.update(aggregate);
  }

  public delete(id: TId): Promise<void> {
    return this.gateway.delete(id);
  }

  public save(aggregate: TAggregate): Promise<void> {
    return this.gateway.save(aggregate);
  }

  public createMany(aggregates: ReadonlyArray<TAggregate>): Promise<void> {
    return this.gateway.createMany(aggregates);
  }

  public updateMany(aggregates: ReadonlyArray<TAggregate>): Promise<void> {
    return this.gateway.updateMany(aggregates);
  }

  public deleteMany(ids: ReadonlyArray<TId>): Promise<void> {
    return this.gateway.deleteMany(ids);
  }
}