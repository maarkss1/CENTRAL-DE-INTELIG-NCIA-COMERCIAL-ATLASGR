/**
 * @file Serializer.ts
 * @description Contract for serializing and deserializing values.
 */

export interface Serializer<TValue> {
  serialize(value: TValue): string;
  deserialize(payload: string): TValue;
}