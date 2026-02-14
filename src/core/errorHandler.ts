/**
 * Error Handler
 * Centralized error handling for the application
 * @module core/errorHandler
 */

import type { Client, ChatInputCommandInteraction } from 'discord.js';
import logger from './Logger.js';
import { AppError } from '../errors/index.js';
// TYPES
type AsyncFunction<T extends unknown[], R> = (...args: T) => Promise<R>;

interface ErrorHandlingOptions {
    context?: string;
    retries?: number;
    retryDelay?: number;
    onError?: (error: Error, ...args: unknown[]) => Promise<unknown> | unknown;
    rethrow?: boolean;
}

interface InteractionErrorBoundaryOptions {
    ephemeral?: boolean;
}
// FUNCTIONS
/**
 * Initialize global error handlers
 * @param client - Discord client
 */
export function initializeErrorHandlers(client: Client): void {
    // Uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
        // Parse stack trace for file/line info
        const stackMatch = error.stack?.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        const file = stackMatch ? stackMatch[2] : undefined;
        const line = stackMatch ? stackMatch[3] : undefined;
        const fn = stackMatch ? stackMatch[1] : undefined;

        // Check if operational error
        if (AppError.isOperationalError(error)) {
            logger.error('ErrorHandler', `Operational Error: ${error.message}`);
        } else {
            logger.critical('ErrorHandler', `Uncaught Exception: ${error.message}`);
            logger.error('ErrorHandler', `Stack: ${error.stack}`);
            
            // Log detailed error to Discord
            logger.logErrorDetailed({
                title: 'Uncaught Exception',
                error,
                file,
                line,
                function: fn,
                context: {
                    'Type': error.name,
                    'Operational': 'false'
                }
            }).catch(() => {});
            
            // For programmer errors, exit after logging
            // (in production, process manager should restart)
            setTimeout(() => process.exit(1), 1000);
        }
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        
        // Parse stack trace for file/line info
        const stackMatch = error.stack?.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        const file = stackMatch ? stackMatch[2] : undefined;
        const line = stackMatch ? stackMatch[3] : undefined;
        const fn = stackMatch ? stackMatch[1] : undefined;
        
        if (AppError.isOperationalError(error)) {
            logger.error('ErrorHandler', `Unhandled Rejection (Operational): ${error.message}`);
        } else {
            logger.critical('ErrorHandler', `Unhandled Rejection: ${error.message}`);
            logger.error('ErrorHandler', `Stack: ${error.stack}`);
            
            // Log detailed error to Discord
            logger.logErrorDetailed({
                title: 'Unhandled Promise Rejection',
                error,
                file,
                line,
                function: fn,
                context: {
                    'Type': error.name,
                    'Promise': '[object Promise]'
                }
            }).catch(() => {});
        }
    });

    logger.info('ErrorHandler', 'Global error handlers initialized');
}

/**
 * Safe async execution wrapper
 * @param fn - Async function to execute
 * @param context - Context for error logging
 * @returns Wrapped function
 */
export function safeAsync<T extends unknown[], R>(
    fn: AsyncFunction<T, R>, 
    context: string = 'Unknown'
): AsyncFunction<T, R> {
    return async (...args: T): Promise<R> => {
        try {
            return await fn(...args);
        } catch (error) {
            logger.error(context, `Error: ${(error as Error).message}`);
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
export function withErrorHandling<T extends unknown[], R>(
    fn: AsyncFunction<T, R>, 
    options: ErrorHandlingOptions = {}
): AsyncFunction<T, R | undefined> {
    const {
        context = 'Unknown',
        retries = 0,
        retryDelay = 1000,
        onError = null,
        rethrow = true
    } = options;

    return async (...args: T): Promise<R | undefined> => {
        let lastError: Error | undefined;
        
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await fn(...args);
            } catch (error) {
                lastError = error as Error;
                logger.error(context, `Attempt ${attempt + 1} failed: ${lastError.message}`);
                
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, retryDelay * (attempt + 1)));
                }
            }
        }

        if (onError && lastError) {
            try {
                return await onError(lastError, ...args) as R;
            } catch {
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
export async function withTimeout<T>(
    fn: () => Promise<T>, 
    timeout: number, 
    context: string = 'Operation'
): Promise<T> {
    let timer: NodeJS.Timeout;
    try {
        return await Promise.race([
            fn(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${context} timed out after ${timeout}ms`)), timeout);
            })
        ]);
    } finally {
        clearTimeout(timer!);
    }
}

/**
 * Create error boundary for Discord interactions
 * @param fn - Handler function
 * @param options - Options
 */
export function interactionErrorBoundary<T extends unknown[]>(
    fn: (interaction: ChatInputCommandInteraction, ...args: T) => Promise<void>,
    options: InteractionErrorBoundaryOptions = {}
): (interaction: ChatInputCommandInteraction, ...args: T) => Promise<void> {
    const { ephemeral = true } = options;
    
    return async (interaction: ChatInputCommandInteraction, ...args: T): Promise<void> => {
        try {
            await fn(interaction, ...args);
        } catch (error) {
            logger.error('Interaction', `${interaction.commandName}: ${(error as Error).message}`);
            
            const errorMessage = AppError.isOperationalError(error as Error)
                ? (error as Error).message
                : 'An unexpected error occurred. Please try again.';

            try {
                const reply = { 
                    content: `❌ ${errorMessage}`, 
                    ephemeral 
                };
                
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(reply);
                } else {
                    await interaction.reply(reply);
                }
            } catch {
                // Ignore reply errors
            }
        }
    };
}
