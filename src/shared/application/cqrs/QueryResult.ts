/**
 * @file QueryResult.ts
 * @description Standardized result wrapper for Query execution.
 */

import type { Result } from '../base/Result.js';
import type { ApplicationError } from '../base/ApplicationError.js';

export type QueryResult<TValue> = Result<TValue, ApplicationError>;
