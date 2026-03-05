/**
 * Base Application Error
 * All custom errors extend from this class
 * @module errors/AppError
 */
import type { AppErrorCode, SerializedError } from '../types/errors/app-error.js';
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
     * @deprecated Use `Result.err(ErrorCodes.XXX)` instead of throwing.
     * Retained for `instanceof` checks in catch blocks and BaseCommand validation.
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

/**
 * Validation errors (user input issues).
 * @deprecated Prefer `Result.err(ErrorCodes.VALIDATION_ERROR)`. Retained for `instanceof` checks.
 */
export class ValidationError extends AppError {
    public readonly field: string | null;

    /** @deprecated Use `Result.err(ErrorCodes.VALIDATION_ERROR)` instead. */
    constructor(message: string, field: string | null = null) {
        super(message, 'VALIDATION_ERROR', 400);
        this.field = field;
    }

    override toJSON(): SerializedError {
        return {
            ...super.toJSON(),
            field: this.field,
        };
    }
}

/**
 * Not found errors.
 * @deprecated Prefer `Result.err(ErrorCodes.NOT_FOUND)`. Retained for `instanceof` checks.
 */
export class NotFoundError extends AppError {
    public readonly resource: string;

    /** @deprecated Use `Result.err(ErrorCodes.NOT_FOUND)` instead. */
    constructor(resource: string = 'Resource') {
        super(`${resource} not found`, 'NOT_FOUND', 404);
        this.resource = resource;
    }

    override toJSON(): SerializedError {
        return {
            ...super.toJSON(),
            resource: this.resource,
        };
    }
}

/**
 * Permission errors.
 * @deprecated Prefer `Result.err(ErrorCodes.PERMISSION_DENIED)`. Retained for `instanceof` checks.
 */
export class PermissionError extends AppError {
    /** @deprecated Use `Result.err(ErrorCodes.PERMISSION_DENIED)` instead. */
    constructor(message: string = 'You do not have permission to perform this action') {
        super(message, 'PERMISSION_DENIED', 403);
    }
}

/**
 * Rate limit errors.
 * @deprecated Prefer `Result.err(ErrorCodes.RATE_LIMITED)`. Retained for `instanceof` checks.
 */
export class RateLimitError extends AppError {
    public readonly retryAfter: number;

    /** @deprecated Use `Result.err(ErrorCodes.RATE_LIMITED)` instead. */
    constructor(retryAfter: number = 60) {
        super(`Rate limited. Try again in ${retryAfter} seconds`, 'RATE_LIMITED', 429);
        this.retryAfter = retryAfter;
    }

    override toJSON(): SerializedError {
        return {
            ...super.toJSON(),
            retryAfter: this.retryAfter,
        };
    }
}

/**
 * External service errors (APIs, etc.).
 * @deprecated Prefer `Result.err(ErrorCodes.EXTERNAL_SERVICE_ERROR)`. Retained for `instanceof` checks.
 */
export class ExternalServiceError extends AppError {
    public readonly service: string;

    /** @deprecated Use `Result.err(ErrorCodes.EXTERNAL_SERVICE_ERROR)` instead. */
    constructor(service: string, message: string = 'External service unavailable') {
        super(`${service}: ${message}`, 'EXTERNAL_SERVICE_ERROR', 503);
        this.service = service;
    }

    override toJSON(): SerializedError {
        return {
            ...super.toJSON(),
            service: this.service,
        };
    }
}

/**
 * Database errors.
 * @deprecated Prefer `Result.err(ErrorCodes.DATABASE_ERROR)`. Retained for `instanceof` checks.
 */
export class DatabaseError extends AppError {
    public readonly operation: string | null;

    /** @deprecated Use `Result.err(ErrorCodes.DATABASE_ERROR)` instead. */
    constructor(message: string = 'Database operation failed', operation: string | null = null) {
        super(message, 'DATABASE_ERROR', 500);
        this.operation = operation;
    }

    override toJSON(): SerializedError {
        return {
            ...super.toJSON(),
            operation: this.operation,
        };
    }
}

/**
 * Configuration errors.
 * @deprecated Prefer `Result.err(ErrorCodes.CONFIGURATION_ERROR)`. Retained for `instanceof` checks.
 */
export class ConfigurationError extends AppError {
    /** @deprecated Use `Result.err(ErrorCodes.CONFIGURATION_ERROR)` instead. */
    constructor(message: string = 'Invalid configuration') {
        super(message, 'CONFIGURATION_ERROR', 500, false);
    }
}

/**
 * Timeout errors.
 * @deprecated Prefer `Result.err(ErrorCodes.TIMEOUT)`. Retained for `instanceof` checks.
 */
export class TimeoutError extends AppError {
    public readonly timeout: number | null;

    /** @deprecated Use `Result.err(ErrorCodes.TIMEOUT)` instead. */
    constructor(operation: string = 'Operation', timeout: number | null = null) {
        super(`${operation} timed out${timeout ? ` after ${timeout}ms` : ''}`, 'TIMEOUT', 408);
        this.timeout = timeout;
    }

    override toJSON(): SerializedError {
        return {
            ...super.toJSON(),
            timeout: this.timeout,
        };
    }
}

/**
 * Cooldown errors.
 * @deprecated Prefer `Result.err(ErrorCodes.COOLDOWN)`. Retained for `instanceof` checks.
 */
export class CooldownError extends AppError {
    public readonly remainingMs: number;

    /** @deprecated Use `Result.err(ErrorCodes.COOLDOWN)` instead. */
    constructor(remainingMs: number) {
        const seconds = Math.ceil(remainingMs / 1000);
        super(`Please wait ${seconds} seconds before using this command again`, 'COOLDOWN', 429);
        this.remainingMs = remainingMs;
    }

    override toJSON(): SerializedError {
        return {
            ...super.toJSON(),
            remainingMs: this.remainingMs,
        };
    }
}

