/**
 * @file RandomIdGenerator.ts
 * @description Default UuidGenerator implementation based on the Node.js crypto module.
 */

import { randomUUID } from 'node:crypto';
import type { UuidGenerator } from './UuidGenerator.js';

export class RandomIdGenerator implements UuidGenerator {
  public generate(): string {
    return randomUUID();
  }
}