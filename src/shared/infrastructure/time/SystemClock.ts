/**
 * @file SystemClock.ts
 * @description Default Clock implementation backed by the system clock.
 */

import type { Clock } from './Clock.js';

export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }

  public timestamp(): number {
    return Date.now();
  }

  public isoString(): string {
    return new Date().toISOString();
  }
}