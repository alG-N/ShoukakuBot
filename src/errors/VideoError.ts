/**
 * Video-specific Error Classes
 * @module errors/VideoError
 */

import { AppError } from './AppError';

/**
 * Video error codes
 */
export type VideoErrorCode =
    | 'VIDEO_ERROR'
    | 'INVALID_URL'
    | 'VIDEO_NOT_FOUND'
    | 'VIDEO_TOO_LONG'
    | 'VIDEO_TOO_LARGE'
    | 'DOWNLOAD_FAILED'
    | 'UNSUPPORTED_PLATFORM';

/**
 * Base video error - use only for catch blocks or instanceof checks.
 * For throwing errors, prefer `Result.err(ErrorCodes.XXX)` pattern.
 */
export class VideoError extends AppError {
    constructor(message: string, code: VideoErrorCode = 'VIDEO_ERROR') {
        super(message, code, 400);
    }
}

// CommonJS compatibility
module.exports = {
    VideoError,
};
