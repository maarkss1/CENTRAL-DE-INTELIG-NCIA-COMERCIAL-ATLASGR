/**
 * @file CommandResult.ts
 * @description Standardized result wrapper for Command execution.
 */

import type { Result } from '../base/Result.js';
import type { ApplicationError } from '../base/ApplicationError.js';

export type CommandResult<TValue> = Result<TValue, ApplicationError>;
