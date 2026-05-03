export type CoreErrorCode = (typeof import('../../core/errors/ErrorCodes.js').ErrorCodes)[keyof typeof import('../../core/errors/ErrorCodes.js').ErrorCodes];

export type ErrorMessages = Record<CoreErrorCode, string>;

export type ErrorCategory =
    | 'GENERAL'
    | 'USER'
    | 'MODERATION'
    | 'MUSIC'
    | 'API'
    | 'DATABASE'
    | 'CACHE'
    | 'GUILD'
    | 'VIDEO';
