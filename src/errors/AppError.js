/**
 * Base Application Error
 * All custom errors extend from this class
 * @module shared/errors/AppError
 */

class AppError extends Error {
    /**
     * @param {string} message - Error message
     * @param {string} code - Error code for programmatic handling
     * @param {number} statusCode - HTTP-like status code
     * @param {boolean} isOperational - Whether error is expected (vs programmer error)
     */
    constructor(message, code = 'UNKNOWN_ERROR', statusCode = 500, isOperational = true) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.timestamp = new Date();
        
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
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
     * @param {Error} error - Error to check
     * @returns {boolean}
     */
    static isOperationalError(error) {
        if (error instanceof AppError) {
            return error.isOperational;
        }
        return false;
    }
}

/**
 * Validation errors (user input issues)
 */
class ValidationError extends AppError {
    constructor(message, field = null) {
        super(message, 'VALIDATION_ERROR', 400);
        this.field = field;
    }
}

/**
 * Not found errors
 */
class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 'NOT_FOUND', 404);
        this.resource = resource;
    }
}

/**
 * Permission errors
 */
class PermissionError extends AppError {
    constructor(message = 'You do not have permission to perform this action') {
        super(message, 'PERMISSION_DENIED', 403);
    }
}

/**
 * Rate limit errors
 */
class RateLimitError extends AppError {
    constructor(retryAfter = 60) {
        super(`Rate limited. Try again in ${retryAfter} seconds`, 'RATE_LIMITED', 429);
        this.retryAfter = retryAfter;
    }
}

/**
 * External service errors (APIs, etc.)
 */
class ExternalServiceError extends AppError {
    constructor(service, message = 'External service unavailable') {
        super(`${service}: ${message}`, 'EXTERNAL_SERVICE_ERROR', 503);
        this.service = service;
    }
}

/**
 * Database errors
 */
class DatabaseError extends AppError {
    constructor(message = 'Database operation failed', operation = null) {
        super(message, 'DATABASE_ERROR', 500);
        this.operation = operation;
    }
}

/**
 * Configuration errors
 */
class ConfigurationError extends AppError {
    constructor(message = 'Invalid configuration') {
        super(message, 'CONFIGURATION_ERROR', 500, false);
    }
}

/**
 * Timeout errors
 */
class TimeoutError extends AppError {
    constructor(operation = 'Operation', timeout = null) {
        super(`${operation} timed out${timeout ? ` after ${timeout}ms` : ''}`, 'TIMEOUT', 408);
        this.timeout = timeout;
    }
}

/**
 * Cooldown errors
 */
class CooldownError extends AppError {
    constructor(remainingMs) {
        const seconds = Math.ceil(remainingMs / 1000);
        super(`Please wait ${seconds} seconds before using this command again`, 'COOLDOWN', 429);
        this.remainingMs = remainingMs;
    }
}

module.exports = {
    AppError,
    ValidationError,
    NotFoundError,
    PermissionError,
    RateLimitError,
    ExternalServiceError,
    DatabaseError,
    ConfigurationError,
    TimeoutError,
    CooldownError
};
