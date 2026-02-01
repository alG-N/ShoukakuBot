/**
 * API-specific Error Classes
 * @module shared/errors/ApiError
 */

const { AppError } = require('./AppError');

/**
 * Base API error
 */
class ApiError extends AppError {
    constructor(message, code = 'API_ERROR', service = null) {
        super(message, code, 400);
        this.service = service;
    }
}

/**
 * API not available error
 */
class ApiUnavailableError extends ApiError {
    constructor(service) {
        super(`${service} API is currently unavailable`, 'API_UNAVAILABLE', service);
    }
}

/**
 * API rate limit error
 */
class ApiRateLimitError extends ApiError {
    constructor(service, retryAfter = null) {
        super(
            `Rate limited by ${service}${retryAfter ? `. Try again in ${retryAfter}s` : ''}`,
            'API_RATE_LIMITED',
            service
        );
        this.retryAfter = retryAfter;
    }
}

/**
 * No results error
 */
class NoResultsError extends ApiError {
    constructor(query = '', service = null) {
        super(`No results found${query ? ` for: ${query}` : ''}`, 'NO_RESULTS', service);
        this.query = query;
    }
}

/**
 * NSFW content error
 */
class NsfwContentError extends ApiError {
    constructor() {
        super('This content is NSFW and can only be viewed in age-restricted channels', 'NSFW_CONTENT');
    }
}

/**
 * Content blocked error
 */
class ContentBlockedError extends ApiError {
    constructor(reason = 'Content is blocked') {
        super(reason, 'CONTENT_BLOCKED');
    }
}

module.exports = {
    ApiError,
    ApiUnavailableError,
    ApiRateLimitError,
    NoResultsError,
    NsfwContentError,
    ContentBlockedError
};
