/**
 * @file EntityProps.ts
 * @description Reusable base type for Entity/Aggregate props, without forcing usage.
 */

/**
 * Reusable base shape for Entity props, preparing every Entity for common
 * cross-cutting concerns without forcing their usage.
 */
export interface EntityProps {
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly deletedAt?: Date | null;
  readonly version?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
