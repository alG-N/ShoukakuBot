"use strict";
/**
 * Error Handler
 * Centralized error handling for the application
 * @module core/errorHandler
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeErrorHandlers = initializeErrorHandlers;
exports.safeAsync = safeAsync;
exports.withErrorHandling = withErrorHandling;
exports.withTimeout = withTimeout;
exports.interactionErrorBoundary = interactionErrorBoundary;
const Logger_1 = __importDefault(require("./Logger"));
const errors_1 = require("../errors");
// FUNCTIONS
/**
 * Initialize global error handlers
 * @param client - Discord client
 */
function initializeErrorHandlers(client) {
    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
        // Parse stack trace for file/line info
        const stackMatch = error.stack?.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        const file = stackMatch ? stackMatch[2] : undefined;
        const line = stackMatch ? stackMatch[3] : undefined;
        const fn = stackMatch ? stackMatch[1] : undefined;
        // Check if operational error
        if (errors_1.AppError.isOperationalError(error)) {
            Logger_1.default.error('ErrorHandler', `Operational Error: ${error.message}`);
        }
        else {
            Logger_1.default.critical('ErrorHandler', `Uncaught Exception: ${error.message}`);
            console.error('Stack:', error.stack);
            // Log detailed error to Discord
            Logger_1.default.logErrorDetailed({
                title: 'Uncaught Exception',
                error,
                file,
                line,
                function: fn,
                context: {
                    'Type': error.name,
                    'Operational': 'false'
                }
            }).catch(() => { });
            // For programmer errors, exit after logging
            // (in production, process manager should restart)
            setTimeout(() => process.exit(1), 1000);
        }
    });
    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        // Parse stack trace for file/line info
        const stackMatch = error.stack?.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        const file = stackMatch ? stackMatch[2] : undefined;
        const line = stackMatch ? stackMatch[3] : undefined;
        const fn = stackMatch ? stackMatch[1] : undefined;
        if (errors_1.AppError.isOperationalError(error)) {
            Logger_1.default.error('ErrorHandler', `Unhandled Rejection (Operational): ${error.message}`);
        }
        else {
            Logger_1.default.critical('ErrorHandler', `Unhandled Rejection: ${error.message}`);
            console.error('Stack:', error.stack);
            // Log detailed error to Discord
            Logger_1.default.logErrorDetailed({
                title: 'Unhandled Promise Rejection',
                error,
                file,
                line,
                function: fn,
                context: {
                    'Type': error.name,
                    'Promise': '[object Promise]'
                }
            }).catch(() => { });
        }
    });
    Logger_1.default.info('ErrorHandler', 'Global error handlers initialized');
}
/**
 * Safe async execution wrapper
 * @param fn - Async function to execute
 * @param context - Context for error logging
 * @returns Wrapped function
 */
function safeAsync(fn, context = 'Unknown') {
    return async (...args) => {
        try {
            return await fn(...args);
        }
        catch (error) {
            Logger_1.default.error(context, `Error: ${error.message}`);
            throw error;
        }
    };
}
/**
 * Wrap an async function with error handling and optional retry
 * @param fn - Async function
 * @param options - Options
 * @returns Wrapped function
 */
function withErrorHandling(fn, options = {}) {
    const { context = 'Unknown', retries = 0, retryDelay = 1000, onError = null, rethrow = true } = options;
    return async (...args) => {
        let lastError;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await fn(...args);
            }
            catch (error) {
                lastError = error;
                Logger_1.default.error(context, `Attempt ${attempt + 1} failed: ${lastError.message}`);
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, retryDelay * (attempt + 1)));
                }
            }
        }
        if (onError && lastError) {
            try {
                return await onError(lastError, ...args);
            }
            catch {
                // Fallback also failed
            }
        }
        if (rethrow && lastError) {
            throw lastError;
        }
        return undefined;
    };
}
/**
 * Execute with timeout
 * @param fn - Async function
 * @param timeout - Timeout in ms
 * @param context - Context for error
 */
async function withTimeout(fn, timeout, context = 'Operation') {
    return Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${context} timed out after ${timeout}ms`)), timeout))
    ]);
}
/**
 * Create error boundary for Discord interactions
 * @param fn - Handler function
 * @param options - Options
 */
function interactionErrorBoundary(fn, options = {}) {
    const { ephemeral = true } = options;
    return async (interaction, ...args) => {
        try {
            await fn(interaction, ...args);
        }
        catch (error) {
            Logger_1.default.error('Interaction', `${interaction.commandName}: ${error.message}`);
            const errorMessage = errors_1.AppError.isOperationalError(error)
                ? error.message
                : 'An unexpected error occurred. Please try again.';
            try {
                const reply = {
                    content: `❌ ${errorMessage}`,
                    ephemeral
                };
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(reply);
                }
                else {
                    await interaction.reply(reply);
                }
            }
            catch {
                // Ignore reply errors
            }
        }
    };
}
//# sourceMappingURL=errorHandler.js.map