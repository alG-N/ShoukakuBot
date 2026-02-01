/**
 * Errors Module
 * Central exports for all error classes
 * @module errors
 */

// Base errors
const {
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
} = require('./AppError');

// Music errors
const {
    MusicError,
    NoVoiceChannelError,
    DifferentVoiceChannelError,
    NoPlayerError,
    EmptyQueueError,
    TrackNotFoundError,
    LavalinkNotReadyError,
    QueueFullError,
    TrackTooLongError,
    DJOnlyError,
    VoicePermissionError
} = require('./MusicError');

// Video errors
const {
    VideoError,
    InvalidUrlError,
    VideoNotFoundError,
    VideoTooLongError,
    VideoTooLargeError,
    DownloadError,
    UnsupportedPlatformError
} = require('./VideoError');

// API errors
const {
    ApiError,
    ApiUnavailableError,
    ApiRateLimitError,
    NoResultsError,
    NsfwContentError,
    ContentBlockedError
} = require('./ApiError');

module.exports = {
    // Base
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
    
    // Music
    MusicError,
    NoVoiceChannelError,
    DifferentVoiceChannelError,
    NoPlayerError,
    EmptyQueueError,
    TrackNotFoundError,
    LavalinkNotReadyError,
    QueueFullError,
    TrackTooLongError,
    DJOnlyError,
    VoicePermissionError,
    
    // Video
    VideoError,
    InvalidUrlError,
    VideoNotFoundError,
    VideoTooLongError,
    VideoTooLargeError,
    DownloadError,
    UnsupportedPlatformError,
    
    // API
    ApiError,
    ApiUnavailableError,
    ApiRateLimitError,
    NoResultsError,
    NsfwContentError,
    ContentBlockedError
};
