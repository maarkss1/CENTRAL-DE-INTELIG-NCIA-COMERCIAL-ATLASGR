/**
 * @file Clock.ts
 * @description Contract for reading the current date/time, decoupled from the system clock.
 */

export interface Clock {
  now(): Date;
  timestamp(): number;
  isoString(): string;
}