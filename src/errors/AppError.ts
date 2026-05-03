/**
 * Base Application Error
 * All custom errors extend from this class
 * @module errors/appError
 */
import type { SerializedError } from '../types/errors/app-error.js';
export { type AppErrorCode, type SerializedError } from '../types/errors/app-error.js';

/**
 * Base application error class.
 * Retained for `instanceof` checks in catch blocks.
 * For new error flows, prefer `Result.err(ErrorCodes.XXX)` pattern.
 */
export class AppError extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly timestamp: Date;

    /**
     * @param message - Error message
     * @param code - Error code for programmatic handling
     * @param statusCode - HTTP-like status code
     * @param isOperational - Whether error is expected (vs programmer error)
     */
    constructor(
        message: string,
        code: string = 'UNKNOWN_ERROR',
        statusCode: number = 500,
        isOperational: boolean = true
    ) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.timestamp = new Date();

        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Serialize error for logging/API response
     */
    toJSON(): SerializedError {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            statusCode: this.statusCode,
            timestamp: this.timestamp,
        };
    }

    /**
     * Check if error is operational (expected) vs programmer error
     */
    static isOperationalError(error: Error): boolean {
        if (error instanceof AppError) {
            return error.isOperational;
        }
        return false;
    }
}

