/**
 * @file ExecutionContext.ts
 * @description Reusable technical execution context, decoupled from business concerns.
 */

/**
 * Minimal logger contract consumed by {@link ExecutionContext}.
 */
export interface ExecutionContextLogger {
  info(message: string, meta?: Readonly<Record<string, unknown>>): void;
  error(message: string, meta?: Readonly<Record<string, unknown>>): void;
}

/**
 * Minimal metrics recorder contract consumed by {@link ExecutionContext}.
 */
export interface ExecutionContextMetrics {
  increment(name: string, tags?: Readonly<Record<string, string>>): void;
  timing(name: string, durationMs: number, tags?: Readonly<Record<string, string>>): void;
}

/**
 * Reusable technical execution context.
 * Preparado para: Request, Execution Time, Correlation, Observability, Metrics, Logger, Tracing, Feature Flags.
 */
export class ExecutionContext {
  public readonly startedAt: number;
  public readonly correlationId: string;
  public readonly traceId?: string;
  public readonly logger?: ExecutionContextLogger;
  public readonly metrics?: ExecutionContextMetrics;
  public readonly featureFlags: Readonly<Record<string, boolean>>;

  public constructor(input: {
    readonly correlationId: string;
    readonly traceId?: string;
    readonly logger?: ExecutionContextLogger;
    readonly metrics?: ExecutionContextMetrics;
    readonly featureFlags?: Readonly<Record<string, boolean>>;
  }) {
    this.startedAt = Date.now();
    this.correlationId = input.correlationId;
    this.traceId = input.traceId;
    this.logger = input.logger;
    this.metrics = input.metrics;
    this.featureFlags = input.featureFlags ?? {};
  }

  public elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  public isFeatureEnabled(flag: string): boolean {
    return this.featureFlags[flag] ?? false;
  }
}
