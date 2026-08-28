/**
 * @file UseCaseContext.ts
 * @description Execution context propagated through every Use Case invocation.
 */

export interface UseCaseUser {
  readonly id: string;
  readonly roles: ReadonlyArray<string>;
}

export interface UseCaseTenant {
  readonly id: string;
  readonly name?: string;
}

/**
 * Business execution context propagated through a Use Case invocation.
 * Preparado para: CorrelationId, Tenant, User, RequestId, Metadata, Cancellation, Tracing.
 */
export class UseCaseContext {
  public readonly correlationId: string;
  public readonly requestId: string;
  public readonly tenant?: UseCaseTenant;
  public readonly user?: UseCaseUser;
  public readonly metadata: Readonly<Record<string, unknown>>;
  public readonly signal?: AbortSignal;
  public readonly traceId?: string;

  private constructor(input: {
    readonly correlationId: string;
    readonly requestId: string;
    readonly tenant?: UseCaseTenant;
    readonly user?: UseCaseUser;
    readonly metadata?: Readonly<Record<string, unknown>>;
    readonly signal?: AbortSignal;
    readonly traceId?: string;
  }) {
    this.correlationId = input.correlationId;
    this.requestId = input.requestId;
    this.tenant = input.tenant;
    this.user = input.user;
    this.metadata = input.metadata ?? {};
    this.signal = input.signal;
    this.traceId = input.traceId;
  }

  public static create(input?: {
    readonly correlationId?: string;
    readonly requestId?: string;
    readonly tenant?: UseCaseTenant;
    readonly user?: UseCaseUser;
    readonly metadata?: Readonly<Record<string, unknown>>;
    readonly signal?: AbortSignal;
    readonly traceId?: string;
  }): UseCaseContext {
    return new UseCaseContext({
      correlationId: input?.correlationId ?? crypto.randomUUID(),
      requestId: input?.requestId ?? crypto.randomUUID(),
      tenant: input?.tenant,
      user: input?.user,
      metadata: input?.metadata,
      signal: input?.signal,
      traceId: input?.traceId,
    });
  }

  public withMetadata(metadata: Readonly<Record<string, unknown>>): UseCaseContext {
    return new UseCaseContext({
      correlationId: this.correlationId,
      requestId: this.requestId,
      tenant: this.tenant,
      user: this.user,
      metadata: { ...this.metadata, ...metadata },
      signal: this.signal,
      traceId: this.traceId,
    });
  }

  public isCancelled(): boolean {
    return this.signal?.aborted ?? false;
  }
}
