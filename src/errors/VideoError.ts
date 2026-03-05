/**
 * Video-specific Error Classes
 * @module errors/VideoError
 */

import { AppError } from './AppError.js';
import type { VideoErrorCode } from '../types/errors/video-error.js';
export { type VideoErrorCode } from '../types/errors/video-error.js';

/**
 * Base video error - use only for catch blocks or instanceof checks.
 * @deprecated Prefer `Result.err(ErrorCodes.XXX)` pattern for new error flows.
 */
export class VideoError extends AppError {
    /** @deprecated Use `Result.err(ErrorCodes.XXX)` instead. */
    constructor(message: string, code: VideoErrorCode = 'VIDEO_ERROR') {
        super(message, code, 400);
    }
}



