/**
 * @file Entity.ts
 * @description Base class for every Entity, encapsulating identity and equality semantics.
 */

import type { UniqueEntityID } from './UniqueEntityID.js';

/**
 * Base class reused by every Domain Entity.
 *
 * Responsible for identity, equality, comparison and encapsulation of props.
 *
 * @typeParam TProps - Shape of the entity's encapsulated properties.
 * @typeParam TId - Type of the entity's identity. Defaults to {@link UniqueEntityID}.
 */
export abstract class Entity<TProps, TId extends UniqueEntityID = UniqueEntityID> {
  protected readonly props: TProps;
  protected readonly _id: TId;

  protected constructor(props: TProps, id: TId) {
    this.props = props;
    this._id = id;
  }

  /**
   * The unique identity of this entity.
   */
  public get id(): TId {
    return this._id;
  }

  /**
   * Compares this entity with another for identity equality.
   * Two entities are equal when they share the same identity, regardless
   * of their current property values.
   */
  public equals(other?: Entity<TProps, TId> | null): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    if (this === other) {
      return true;
    }

    if (!(other instanceof Entity)) {
      return false;
    }

    return this._id.equals(other._id);
  }
}
