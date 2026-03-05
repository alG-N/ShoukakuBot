/**
 * Error Codes Enum
 * Centralized error codes for consistent error handling
 * @module core/ErrorCodes
 */
import type { CoreErrorCode, ErrorCategory, ErrorMessages } from '../types/core/error-codes.js';
// ERROR CODES
/**
 * Error codes organized by domain
 */
export const ErrorCodes = {
    // GENERAL ERRORS (1xxx)
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    INVALID_INPUT: 'INVALID_INPUT',
    NOT_FOUND: 'NOT_FOUND',
    UNAUTHORIZED: 'UNAUTHORIZED',
    RATE_LIMITED: 'RATE_LIMITED',
    TIMEOUT: 'TIMEOUT',
    DISABLED: 'DISABLED',
    MAINTENANCE: 'MAINTENANCE',
    // USER ERRORS (2xxx)
    USER_NOT_FOUND: 'USER_NOT_FOUND',
    USER_IS_BOT: 'USER_IS_BOT',
    USER_IS_SELF: 'USER_IS_SELF',
    USER_IS_OWNER: 'USER_IS_OWNER',
    USER_HIGHER_ROLE: 'USER_HIGHER_ROLE',
    USER_ALREADY_BANNED: 'USER_ALREADY_BANNED',
    USER_NOT_BANNED: 'USER_NOT_BANNED',
    USER_ALREADY_MUTED: 'USER_ALREADY_MUTED',
    USER_NOT_MUTED: 'USER_NOT_MUTED',
    USER_NOT_IN_VOICE: 'USER_NOT_IN_VOICE',
    USER_IN_DIFFERENT_VOICE: 'USER_IN_DIFFERENT_VOICE',
    // MODERATION ERRORS (3xxx)
    CANNOT_BAN: 'CANNOT_BAN',
    CANNOT_KICK: 'CANNOT_KICK',
    CANNOT_MUTE: 'CANNOT_MUTE',
    CANNOT_WARN: 'CANNOT_WARN',
    CANNOT_DELETE: 'CANNOT_DELETE',
    WARN_NOT_FOUND: 'WARN_NOT_FOUND',
    CASE_NOT_FOUND: 'CASE_NOT_FOUND',
    MUTE_ROLE_NOT_FOUND: 'MUTE_ROLE_NOT_FOUND',
    MOD_LOG_NOT_FOUND: 'MOD_LOG_NOT_FOUND',
    AUTOMOD_DISABLED: 'AUTOMOD_DISABLED',
    INVALID_DURATION: 'INVALID_DURATION',
    // MUSIC ERRORS (4xxx)
    NO_PLAYER: 'NO_PLAYER',
    NO_TRACK: 'NO_TRACK',
    NO_QUEUE: 'NO_QUEUE',
    QUEUE_FULL: 'QUEUE_FULL',
    TRACK_NOT_FOUND: 'TRACK_NOT_FOUND',
    INVALID_POSITION: 'INVALID_POSITION',
    ALREADY_PAUSED: 'ALREADY_PAUSED',
    NOT_PAUSED: 'NOT_PAUSED',
    VOICE_REQUIRED: 'VOICE_REQUIRED',
    DIFFERENT_VOICE: 'DIFFERENT_VOICE',
    DJ_ONLY: 'DJ_ONLY',
    LAVALINK_ERROR: 'LAVALINK_ERROR',
    SEARCH_FAILED: 'SEARCH_FAILED',
    PLAYLIST_ERROR: 'PLAYLIST_ERROR',
    UNSUPPORTED_SOURCE: 'UNSUPPORTED_SOURCE',
    ALREADY_CONNECTED: 'ALREADY_CONNECTED',
    // API ERRORS (5xxx)
    API_ERROR: 'API_ERROR',
    API_RATE_LIMITED: 'API_RATE_LIMITED',
    API_UNAVAILABLE: 'API_UNAVAILABLE',
    API_TIMEOUT: 'API_TIMEOUT',
    API_INVALID_RESPONSE: 'API_INVALID_RESPONSE',
    NO_RESULTS: 'NO_RESULTS',
    NSFW_REQUIRED: 'NSFW_REQUIRED',
    CONTENT_BLOCKED: 'CONTENT_BLOCKED',
    // DATABASE ERRORS (6xxx)
    DB_ERROR: 'DB_ERROR',
    DB_CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
    DB_QUERY_FAILED: 'DB_QUERY_FAILED',
    DB_TRANSACTION_FAILED: 'DB_TRANSACTION_FAILED',
    DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
    // CACHE ERRORS (7xxx)
    CACHE_ERROR: 'CACHE_ERROR',
    CACHE_MISS: 'CACHE_MISS',
    REDIS_ERROR: 'REDIS_ERROR',
    // GUILD ERRORS (8xxx)
    GUILD_NOT_FOUND: 'GUILD_NOT_FOUND',
    CHANNEL_NOT_FOUND: 'CHANNEL_NOT_FOUND',
    ROLE_NOT_FOUND: 'ROLE_NOT_FOUND',
    MISSING_PERMISSIONS: 'MISSING_PERMISSIONS',
    INVALID_CHANNEL_TYPE: 'INVALID_CHANNEL_TYPE',
    // VIDEO ERRORS (9xxx)
    VIDEO_NOT_FOUND: 'VIDEO_NOT_FOUND',
    VIDEO_TOO_LONG: 'VIDEO_TOO_LONG',
    VIDEO_TOO_LARGE: 'VIDEO_TOO_LARGE',
    DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
    PROCESSING_FAILED: 'PROCESSING_FAILED',
    UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
} as const;

// ERROR MESSAGES

const ERROR_MESSAGES_EN: ErrorMessages = {
    // General
    INTERNAL_ERROR: 'An unexpected error occurred.',
    INVALID_INPUT: 'Invalid input.',
    NOT_FOUND: 'Not found.',
    UNAUTHORIZED: 'You do not have permission to perform this action.',
    RATE_LIMITED: 'You are doing this too fast. Please wait a moment.',
    TIMEOUT: 'Operation timed out.',
    DISABLED: 'This feature is disabled.',
    MAINTENANCE: 'System is under maintenance.',

    // User
    USER_NOT_FOUND: 'User not found.',
    USER_IS_BOT: 'Cannot perform this action on a bot.',
    USER_IS_SELF: 'You cannot perform this action on yourself.',
    USER_IS_OWNER: 'Cannot perform this action on the server owner.',
    USER_HIGHER_ROLE: 'This user has a higher role than you.',
    USER_ALREADY_BANNED: 'This user is already banned.',
    USER_NOT_BANNED: 'This user is not banned.',
    USER_ALREADY_MUTED: 'This user is already muted.',
    USER_NOT_MUTED: 'This user is not muted.',
    USER_NOT_IN_VOICE: 'You need to join a voice channel first.',
    USER_IN_DIFFERENT_VOICE: 'You are in a different voice channel than the bot.',

    // Moderation
    CANNOT_BAN: 'Cannot ban this user.',
    CANNOT_KICK: 'Cannot kick this user.',
    CANNOT_MUTE: 'Cannot mute this user.',
    CANNOT_WARN: 'Cannot warn this user.',
    CANNOT_DELETE: 'Cannot delete messages.',
    WARN_NOT_FOUND: 'Warning not found.',
    CASE_NOT_FOUND: 'Case not found.',
    MUTE_ROLE_NOT_FOUND: 'Mute role not configured.',
    MOD_LOG_NOT_FOUND: 'Mod log channel not configured.',
    AUTOMOD_DISABLED: 'AutoMod is disabled.',
    INVALID_DURATION: 'Invalid duration.',

    // Music
    NO_PLAYER: 'No music is playing.',
    NO_TRACK: 'No track available.',
    NO_QUEUE: 'Queue is empty.',
    QUEUE_FULL: 'Queue is full.',
    TRACK_NOT_FOUND: 'Track not found.',
    INVALID_POSITION: 'Invalid position.',
    ALREADY_PAUSED: 'Music is already paused.',
    NOT_PAUSED: 'Music is not paused.',
    VOICE_REQUIRED: 'You need to join a voice channel.',
    DIFFERENT_VOICE: 'You must be in the same voice channel as the bot.',
    DJ_ONLY: 'Only DJs can perform this action.',
    LAVALINK_ERROR: 'Lavalink connection error.',
    SEARCH_FAILED: 'Search failed.',
    PLAYLIST_ERROR: 'Cannot load playlist.',
    UNSUPPORTED_SOURCE: 'Unsupported music source.',
    ALREADY_CONNECTED: 'Bot is already in a voice channel.',

    // API
    API_ERROR: 'External API error.',
    API_RATE_LIMITED: 'API rate limited.',
    API_UNAVAILABLE: 'Service temporarily unavailable.',
    API_TIMEOUT: 'Request timed out.',
    API_INVALID_RESPONSE: 'Invalid response.',
    NO_RESULTS: 'No results found.',
    NSFW_REQUIRED: 'This command can only be used in NSFW channels.',
    CONTENT_BLOCKED: 'Content blocked.',

    // Database
    DB_ERROR: 'Database error.',
    DB_CONNECTION_FAILED: 'Cannot connect to database.',
    DB_QUERY_FAILED: 'Query failed.',
    DB_TRANSACTION_FAILED: 'Transaction failed.',
    DUPLICATE_ENTRY: 'Data already exists.',

    // Cache
    CACHE_ERROR: 'Cache error.',
    CACHE_MISS: 'Not found in cache.',
    REDIS_ERROR: 'Redis connection error.',

    // Guild
    GUILD_NOT_FOUND: 'Server not found.',
    CHANNEL_NOT_FOUND: 'Channel not found.',
    ROLE_NOT_FOUND: 'Role not found.',
    MISSING_PERMISSIONS: 'Bot is missing permissions.',
    INVALID_CHANNEL_TYPE: 'Invalid channel type.',

    // Video
    VIDEO_NOT_FOUND: 'Video not found.',
    VIDEO_TOO_LONG: 'Video is too long.',
    VIDEO_TOO_LARGE: 'Video is too large.',
    DOWNLOAD_FAILED: 'Download failed.',
    PROCESSING_FAILED: 'Video processing failed.',
    UNSUPPORTED_FORMAT: 'Unsupported format.',
};
// ERROR CATEGORIES
const ERROR_CATEGORIES: Record<string, CoreErrorCode[]> = {
    GENERAL: ['INTERNAL_ERROR', 'INVALID_INPUT', 'NOT_FOUND', 'UNAUTHORIZED', 'RATE_LIMITED', 'TIMEOUT', 'DISABLED', 'MAINTENANCE'],
    USER: ['USER_NOT_FOUND', 'USER_IS_BOT', 'USER_IS_SELF', 'USER_IS_OWNER', 'USER_HIGHER_ROLE', 'USER_ALREADY_BANNED', 'USER_NOT_BANNED', 'USER_ALREADY_MUTED', 'USER_NOT_MUTED', 'USER_NOT_IN_VOICE', 'USER_IN_DIFFERENT_VOICE'],
    MODERATION: ['CANNOT_BAN', 'CANNOT_KICK', 'CANNOT_MUTE', 'CANNOT_WARN', 'CANNOT_DELETE', 'WARN_NOT_FOUND', 'CASE_NOT_FOUND', 'MUTE_ROLE_NOT_FOUND', 'MOD_LOG_NOT_FOUND', 'AUTOMOD_DISABLED', 'INVALID_DURATION'],
    MUSIC: ['NO_PLAYER', 'NO_TRACK', 'NO_QUEUE', 'QUEUE_FULL', 'TRACK_NOT_FOUND', 'INVALID_POSITION', 'ALREADY_PAUSED', 'NOT_PAUSED', 'VOICE_REQUIRED', 'DIFFERENT_VOICE', 'DJ_ONLY', 'LAVALINK_ERROR', 'SEARCH_FAILED', 'PLAYLIST_ERROR', 'UNSUPPORTED_SOURCE', 'ALREADY_CONNECTED'],
    API: ['API_ERROR', 'API_RATE_LIMITED', 'API_UNAVAILABLE', 'API_TIMEOUT', 'API_INVALID_RESPONSE', 'NO_RESULTS', 'NSFW_REQUIRED', 'CONTENT_BLOCKED'],
    DATABASE: ['DB_ERROR', 'DB_CONNECTION_FAILED', 'DB_QUERY_FAILED', 'DB_TRANSACTION_FAILED', 'DUPLICATE_ENTRY'],
    CACHE: ['CACHE_ERROR', 'CACHE_MISS', 'REDIS_ERROR'],
    GUILD: ['GUILD_NOT_FOUND', 'CHANNEL_NOT_FOUND', 'ROLE_NOT_FOUND', 'MISSING_PERMISSIONS', 'INVALID_CHANNEL_TYPE'],
    VIDEO: ['VIDEO_NOT_FOUND', 'VIDEO_TOO_LONG', 'VIDEO_TOO_LARGE', 'DOWNLOAD_FAILED', 'PROCESSING_FAILED', 'UNSUPPORTED_FORMAT'],
};

// FUNCTIONS
/**
 * Get user-friendly message for error code
 */
export function getErrorMessage(code: string, _locale: string = 'en'): string {
    return ERROR_MESSAGES_EN[code as CoreErrorCode] || 'An error occurred.';
}

/**
 * Check if error code belongs to a category
 */
export function isErrorCategory(code: string, category: ErrorCategory): boolean {
    return ERROR_CATEGORIES[category]?.includes(code as CoreErrorCode) || false;
}

export { type CoreErrorCode, type ErrorCategory, type ErrorMessages };

