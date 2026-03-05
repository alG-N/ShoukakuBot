/**
 * API-specific Error Classes
 * @module errors/ApiError
 */

import { AppError } from './AppError.js';
import type { SerializedError } from '../types/errors/app-error.js';
import type { ApiErrorCode } from '../types/errors/api-error.js';
export { type ApiErrorCode } from '../types/errors/api-error.js';

/**
 * Base API error - use only for catch blocks or instanceof checks.
 * @deprecated Prefer `Result.err(ErrorCodes.XXX)` pattern for new error flows.
 */
export class ApiError extends AppError {
    public readonly service: string | null;

    /** @deprecated Use `Result.err(ErrorCodes.XXX)` instead. */
    constructor(message: string, code: ApiErrorCode = 'API_ERROR', service: string | null = null) {
        super(message, code, 400);
        this.service = service;
    }

    override toJSON(): SerializedError {
        return {
            ...super.toJSON(),
            service: this.service,
        };
    }
}

