/**
 * Errors Module
 * Central exports for all error classes
 * @module errors
 */

// Base error
export { AppError } from './AppError.js';

export { type SerializedError, type AppErrorCode } from '../types/errors/app-error.js';

// Type exports
export { type MusicErrorCode } from '../types/errors/music-error.js';
export { type VideoErrorCode } from '../types/errors/video-error.js';
export { type ApiErrorCode } from '../types/errors/api-error.js';





