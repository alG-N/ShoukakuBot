/**
 * API-specific Error Classes
 * @module errors/ApiError
 */

import { AppError, SerializedError } from './AppError';

/**
 * API error codes
 */
export type ApiErrorCode =
    | 'API_ERROR'
    | 'API_UNAVAILABLE'
    | 'API_RATE_LIMITED'
    | 'NO_RESULTS'
    | 'NSFW_CONTENT'
    | 'CONTENT_BLOCKED';

/**
 * Base API error - use only for catch blocks or instanceof checks.
 * For throwing errors, prefer `Result.err(ErrorCodes.XXX)` pattern.
 */
export class ApiError extends AppError {
    public readonly service: string | null;

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

// CommonJS compatibility
module.exports = {
    ApiError,
};
