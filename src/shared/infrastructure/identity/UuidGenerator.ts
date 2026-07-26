/**
 * @file UuidGenerator.ts
 * @description Contract for identifier generation, decoupled from a concrete implementation.
 */

export interface UuidGenerator {
  generate(): string;
}