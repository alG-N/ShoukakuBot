/**
 * Core Errors Category
 * @module core/errors
 */

export { Result } from './Result.js';
export { type ErrorDetails, type ReplyOptions, type DiscordReply, type ResultJSON } from './Result.js';

export { ErrorCodes, getErrorMessage, isErrorCategory } from './ErrorCodes.js';
export { type CoreErrorCode, type ErrorCategory } from './ErrorCodes.js';

export {
    initializeErrorHandlers,
    safeAsync,
    withErrorHandling,
    withTimeout,
    interactionErrorBoundary
} from './errorHandler.js';