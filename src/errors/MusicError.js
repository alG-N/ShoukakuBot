/**
 * Music-specific Error Classes
 * @module shared/errors/MusicError
 */

const { AppError } = require('./AppError');

/**
 * Base music error
 */
class MusicError extends AppError {
    constructor(message, code = 'MUSIC_ERROR') {
        super(message, code, 400);
    }
}

/**
 * No voice channel error
 */
class NoVoiceChannelError extends MusicError {
    constructor() {
        super('You must be in a voice channel to use this command', 'NO_VOICE_CHANNEL');
    }
}

/**
 * Different voice channel error
 */
class DifferentVoiceChannelError extends MusicError {
    constructor() {
        super('You must be in the same voice channel as the bot', 'DIFFERENT_VOICE_CHANNEL');
    }
}

/**
 * No player error
 */
class NoPlayerError extends MusicError {
    constructor() {
        super('No music is currently playing', 'NO_PLAYER');
    }
}

/**
 * Empty queue error
 */
class EmptyQueueError extends MusicError {
    constructor() {
        super('The queue is empty', 'EMPTY_QUEUE');
    }
}

/**
 * Track not found error
 */
class TrackNotFoundError extends MusicError {
    constructor(query = '') {
        super(`No results found${query ? ` for: ${query}` : ''}`, 'TRACK_NOT_FOUND');
        this.query = query;
    }
}

/**
 * Lavalink not ready error
 */
class LavalinkNotReadyError extends MusicError {
    constructor() {
        super('Music service is not available. Please try again later.', 'LAVALINK_NOT_READY');
    }
}

/**
 * Queue full error
 */
class QueueFullError extends MusicError {
    constructor(maxSize) {
        super(`Queue is full (max ${maxSize} tracks)`, 'QUEUE_FULL');
        this.maxSize = maxSize;
    }
}

/**
 * Track too long error
 */
class TrackTooLongError extends MusicError {
    constructor(duration, maxDuration) {
        super(`Track is too long (${duration}). Maximum allowed: ${maxDuration}`, 'TRACK_TOO_LONG');
        this.duration = duration;
        this.maxDuration = maxDuration;
    }
}

/**
 * DJ only error
 */
class DJOnlyError extends MusicError {
    constructor() {
        super('This action is restricted to DJs only', 'DJ_ONLY');
    }
}

/**
 * Voice permission error
 */
class VoicePermissionError extends MusicError {
    constructor(permission = 'connect') {
        super(`Missing permission to ${permission} to the voice channel`, 'VOICE_PERMISSION');
        this.permission = permission;
    }
}

module.exports = {
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
};
