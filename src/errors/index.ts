/**
 * Errors Module
 * Central exports for all error classes
 * @module errors
 */

// Base errors (AppError subclasses)
export {
    AppError,
    ValidationError,
    NotFoundError,
    PermissionError,
    RateLimitError,
    ExternalServiceError,
    DatabaseError,
    ConfigurationError,
    TimeoutError,
    CooldownError,
} from './AppError.js';

export { type SerializedError, type AppErrorCode } from '../types/errors/app-error.js';

// Domain base errors (for instanceof checks only)
export { MusicError } from './MusicError.js';
export { VideoError } from './VideoError.js';
export { ApiError } from './ApiError.js';

// Type exports
export { type MusicErrorCode } from '../types/errors/music-error.js';
export { type VideoErrorCode } from '../types/errors/video-error.js';
export { type ApiErrorCode } from '../types/errors/api-error.js';





