/**
 * @file JsonSerializer.ts
 * @description Default Serializer implementation using JSON.
 */

import type { Serializer } from './Serializer.js';

export class JsonSerializer<TValue> implements Serializer<TValue> {
  public serialize(value: TValue): string {
    return JSON.stringify(value);
  }

  public deserialize(payload: string): TValue {
    return JSON.parse(payload) as TValue;
  }
}