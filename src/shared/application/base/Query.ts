/**
 * @file Query.ts
 * @description Base class for Queries, preparing the ground for CQRS.
 */

/**
 * Base class for every Query in a CQRS-oriented Application layer.
 * A Query represents an intent to read system state without side effects.
 *
 * @typeParam TPayload - Shape of the data carried by the query.
 */
export abstract class Query<TPayload> {
  public readonly payload: TPayload;
  public readonly issuedAt: Date;

  protected constructor(payload: TPayload) {
    this.payload = payload;
    this.issuedAt = new Date();
  }
}
