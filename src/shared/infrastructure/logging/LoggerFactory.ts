/**
 * @file LoggerFactory.ts
 * @description Reusable factory for creating Logger instances.
 */

import type { Logger } from './Logger.js';
import { NullLogger } from './NullLogger.js';

export type LoggerProvider = (scope: string) => Logger;

export class LoggerFactory {
  private static provider: LoggerProvider = () => new NullLogger();

  public static configure(provider: LoggerProvider): void {
    LoggerFactory.provider = provider;
  }

  public static create(scope: string): Logger {
    return LoggerFactory.provider(scope);
  }
}