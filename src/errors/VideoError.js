/**
 * Video-specific Error Classes
 * @module shared/errors/VideoError
 */

const { AppError } = require('./AppError');

/**
 * Base video error
 */
class VideoError extends AppError {
    constructor(message, code = 'VIDEO_ERROR') {
        super(message, code, 400);
    }
}

/**
 * Invalid URL error
 */
class InvalidUrlError extends VideoError {
    constructor(url = '') {
        super(`Invalid or unsupported URL${url ? `: ${url}` : ''}`, 'INVALID_URL');
        this.url = url;
    }
}

/**
 * Video not found error
 */
class VideoNotFoundError extends VideoError {
    constructor() {
        super('Video not found or unavailable', 'VIDEO_NOT_FOUND');
    }
}

/**
 * Video too long error
 */
class VideoTooLongError extends VideoError {
    constructor(duration, maxDuration) {
        super(`Video is too long (${duration}). Maximum allowed: ${maxDuration}`, 'VIDEO_TOO_LONG');
        this.duration = duration;
        this.maxDuration = maxDuration;
    }
}

/**
 * Video too large error
 */
class VideoTooLargeError extends VideoError {
    constructor(size, maxSize) {
        super(`Video file is too large (${size}). Maximum: ${maxSize}`, 'VIDEO_TOO_LARGE');
        this.size = size;
        this.maxSize = maxSize;
    }
}

/**
 * Download failed error
 */
class DownloadError extends VideoError {
    constructor(reason = 'Unknown error') {
        super(`Failed to download video: ${reason}`, 'DOWNLOAD_FAILED');
    }
}

/**
 * Unsupported platform error
 */
class UnsupportedPlatformError extends VideoError {
    constructor(platform = 'unknown') {
        super(`Platform not supported: ${platform}`, 'UNSUPPORTED_PLATFORM');
        this.platform = platform;
    }
}

module.exports = {
    VideoError,
    InvalidUrlError,
    VideoNotFoundError,
    VideoTooLongError,
    VideoTooLargeError,
    DownloadError,
    UnsupportedPlatformError
};
