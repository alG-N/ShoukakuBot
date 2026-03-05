/**
 * Music-specific Error Classes
 * @module errors/MusicError
 */

import { AppError } from './AppError.js';
import type { MusicErrorCode } from '../types/errors/music-error.js';
export { type MusicErrorCode } from '../types/errors/music-error.js';

/**
 * Base music error - use only for catch blocks or instanceof checks.
 * @deprecated Prefer `Result.err(ErrorCodes.XXX)` pattern for new error flows.
 */
export class MusicError extends AppError {
    /** @deprecated Use `Result.err(ErrorCodes.XXX)` instead. */
    constructor(message: string, code: MusicErrorCode = 'MUSIC_ERROR') {
        super(message, code, 400);
    }
}

