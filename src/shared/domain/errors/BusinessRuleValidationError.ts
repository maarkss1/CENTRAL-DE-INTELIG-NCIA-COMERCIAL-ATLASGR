/**
 * @file BusinessRuleValidationError.ts
 * @description Represents the violation of a business rule.
 */

import { DomainException, type DomainExceptionDetails } from './DomainException.js';

/**
 * Raised when a business rule is violated.
 */
export class BusinessRuleValidationError extends DomainException {
  public readonly rule: string;

  public constructor(rule: string, message: string, details?: DomainExceptionDetails) {
    super(message, 'BUSINESS_RULE_VIOLATION', { ...details, rule });
    this.rule = rule;
  }
}
