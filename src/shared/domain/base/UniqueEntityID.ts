/**
 * @file UniqueEntityID.ts
 * @description Value object representing a unique identity based on UUID.
 */

import { randomUUID } from 'node:crypto';

/**
 * Represents a unique identifier for an Entity or Aggregate Root.
 * Wraps a UUID string, providing generation, validation, comparison and
 * serialization semantics.
 */
export class UniqueEntityID {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Creates a new {@link UniqueEntityID}. When no value is provided a new
   * UUID (v4) is generated automatically.
   */
  public static create(value?: string): UniqueEntityID {
    if (value !== undefined) {
      UniqueEntityID.ensureIsValid(value);
      return new UniqueEntityID(value);
    }

    return new UniqueEntityID(randomUUID());
  }

  private static ensureIsValid(value: string): void {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(value)) {
      throw new Error(`Invalid UniqueEntityID value: "${value}".`);
    }
  }

  /**
   * Compares this identity with another for structural equality.
   */
  public equals(other?: UniqueEntityID | null): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    if (!(other instanceof UniqueEntityID)) {
      return false;
    }

    return this.value === other.value;
  }

  /**
   * Returns the underlying string representation of this identity.
   */
  public toString(): string {
    return this.value;
  }

  /**
   * Returns the underlying string value.
   */
  public toValue(): string {
    return this.value;
  }
}
