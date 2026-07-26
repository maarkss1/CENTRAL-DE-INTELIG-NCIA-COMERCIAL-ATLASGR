/**
 * @file NullLogger.ts
 * @description Null Object implementation of Logger, useful for tests and disabled logging.
 */

import type { Logger, LogMetadata } from './Logger.js';

export class NullLogger implements Logger {
  public trace(_message: string, _metadata?: LogMetadata): void {
    return;
  }

  public debug(_message: string, _metadata?: LogMetadata): void {
    return;
  }

  public info(_message: string, _metadata?: LogMetadata): void {
    return;
  }

  public warn(_message: string, _metadata?: LogMetadata): void {
    return;
  }

  public error(_message: string, _metadata?: LogMetadata): void {
    return;
  }

  public fatal(_message: string, _metadata?: LogMetadata): void {
    return;
  }

  public child(_bindings: LogMetadata): Logger {
    return this;
  }
}