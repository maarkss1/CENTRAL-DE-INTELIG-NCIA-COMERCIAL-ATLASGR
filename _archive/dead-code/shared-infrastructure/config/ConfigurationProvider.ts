/**
 * @file ConfigurationProvider.ts
 * @description Contract and default implementation for configuration sourcing.
 */

import { Configuration } from './Configuration.js';

export interface IConfigurationProvider {
  getConfiguration(): Configuration;
  reload(): void;
}

export class ConfigurationProvider implements IConfigurationProvider {
  private readonly source: () => Readonly<Record<string, string | undefined>>;
  private configuration: Configuration;

  public constructor(source: () => Readonly<Record<string, string | undefined>>) {
    this.source = source;
    this.configuration = new Configuration(source());
  }

  public getConfiguration(): Configuration {
    return this.configuration;
  }

  public reload(): void {
    this.configuration = new Configuration(this.source());
  }
}