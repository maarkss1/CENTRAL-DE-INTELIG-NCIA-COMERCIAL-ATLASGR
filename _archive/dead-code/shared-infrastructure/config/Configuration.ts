/**
 * @file Configuration.ts
 * @description Immutable configuration container built from raw key-value sources.
 */

export class Configuration {
  private readonly values: ReadonlyMap<string, string>;

  public constructor(values: Readonly<Record<string, string | undefined>>) {
    const entries = Object.entries(values).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    );
    this.values = new Map(entries);
  }

  public get(key: string): string | undefined {
    return this.values.get(key);
  }

  public getRequired(key: string): string {
    const value = this.values.get(key);

    if (value === undefined) {
      throw new Error(`Missing required configuration key: "${key}".`);
    }

    return value;
  }

  public getOrDefault(key: string, defaultValue: string): string {
    return this.values.get(key) ?? defaultValue;
  }

  public getNumber(key: string): number | undefined {
    const value = this.values.get(key);
    return value === undefined ? undefined : Number(value);
  }

  public getBoolean(key: string): boolean | undefined {
    const value = this.values.get(key);
    return value === undefined ? undefined : value.toLowerCase() === 'true';
  }

  public has(key: string): boolean {
    return this.values.has(key);
  }

  public isFeatureEnabled(flagKey: string): boolean {
    return this.getBoolean(flagKey) ?? false;
  }

  public toObject(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.values);
  }
}