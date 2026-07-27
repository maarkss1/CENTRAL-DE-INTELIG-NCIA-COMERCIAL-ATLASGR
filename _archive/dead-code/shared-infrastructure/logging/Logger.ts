/**
 * @file Logger.ts
 * @description Generic logging contract, decoupled from any concrete logging library.
 */

export type LogMetadata = Readonly<Record<string, unknown>>;

/**
 * Generic logging contract. Preparado para: Console, Pino, Winston, OpenTelemetry.
 */
export interface Logger {
  trace(message: string, metadata?: LogMetadata): void;
  debug(message: string, metadata?: LogMetadata): void;
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, metadata?: LogMetadata): void;
  fatal(message: string, metadata?: LogMetadata): void;
  child(bindings: LogMetadata): Logger;
}