/**
 * @file Repository.ts
 * @description Base contract combining read and write repository capabilities, reused across all Aggregates.
 */

import type { AggregateRoot } from '../../domain/base/AggregateRoot.js';
import type { UniqueEntityID } from '../../domain/base/UniqueEntityID.js';
import type { IRepository } from '../../domain/contracts/IRepository.js';

export type Repository<TAggregate extends AggregateRoot<unknown, UniqueEntityID>> =
  IRepository<TAggregate>;