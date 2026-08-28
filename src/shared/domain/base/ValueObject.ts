/**
 * @file ValueObject.ts
 * @description Base class for every Value Object, guaranteeing immutability and structural equality.
 */

/**
 * Base class reused by every Domain Value Object.
 *
 * Responsible for immutability (via `Object.freeze`) and deep structural
 * equality comparison.
 *
 * @typeParam TProps - Shape of the value object's encapsulated properties.
 */
export abstract class ValueObject<TProps> {
  protected readonly props: TProps;

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props });
  }

  /**
   * Compares this value object with another for deep structural equality.
   */
  public equals(other?: ValueObject<TProps> | null): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    if (!(other instanceof ValueObject)) {
      return false;
    }

    return ValueObject.deepEqual(this.props, other.props);
  }

  private static deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
      return true;
    }

    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
      return false;
    }

    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);

    if (aKeys.length !== bKeys.length) {
      return false;
    }

    return aKeys.every((key) =>
      ValueObject.deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    );
  }
}
