/**
 * Error Handler
 * Centralized error handling for the application
 * @module core/errorHandler
 */

// Use core logger
const logger = require('./Logger');
// Use errors module
const { AppError } = require('../errors');

// Shutdown handlers registry
const shutdownHandlers = [];

/**
 * Register a shutdown handler
 * @param {Function} handler - Async function to call on shutdown
 */
function registerShutdownHandler(handler) {
    shutdownHandlers.push(handler);
}

/**
 * Initialize global error handlers
 * @param {Client} client - Discord client
 */
function initializeErrorHandlers(client) {
    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
        // Check if operational error
        if (AppError.isOperationalError(error)) {
            logger.error('ErrorHandler', `Operational Error: ${error.message}`);
        } else {
            logger.critical('ErrorHandler', `Uncaught Exception: ${error.message}`);
            console.error('Stack:', error.stack);
            
            // Log to Discord if possible
            logger.logError('Uncaught Exception', error).catch(() => {});
            
            // For programmer errors, exit after logging
            // (in production, process manager should restart)
            setTimeout(() => process.exit(1), 1000);
        }
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        
        if (AppError.isOperationalError(error)) {
            logger.error('ErrorHandler', `Unhandled Rejection (Operational): ${error.message}`);
        } else {
            logger.critical('ErrorHandler', `Unhandled Rejection: ${error.message}`);
            console.error('Stack:', error.stack);
            logger.logError('Unhandled Rejection', error).catch(() => {});
        }
    });

    // Graceful shutdown signals
    process.on('SIGINT', () => handleShutdown('SIGINT', client));
    process.on('SIGTERM', () => handleShutdown('SIGTERM', client));

    // Windows specific
    if (process.platform === 'win32') {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.on('SIGINT', () => process.emit('SIGINT'));
    }

    logger.info('ErrorHandler', 'Global error handlers initialized');
}

/**
 * Handle graceful shutdown
 * @param {string} signal - Signal received
 * @param {Client} client - Discord client
 */
async function handleShutdown(signal, client = null) {
    logger.info('Shutdown', `Received ${signal}, shutting down gracefully...`);
    
    try {
        // Run all registered shutdown handlers
        const timeout = 10000; // 10 second timeout
        
        await Promise.race([
            runShutdownHandlers(client),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Shutdown timeout')), timeout)
            )
        ]);
        
        logger.info('Shutdown', 'Graceful shutdown complete');
        process.exit(0);
    } catch (error) {
        logger.error('Shutdown', `Error during shutdown: ${error.message}`);
        process.exit(1);
    }
}

/**
 * Run all shutdown handlers
 */
async function runShutdownHandlers(client) {
    // Destroy Discord client
    if (client) {
        try {
            client.destroy();
            logger.info('Shutdown', 'Discord client destroyed');
        } catch {}
    }

    // Run registered handlers
    for (const handler of shutdownHandlers) {
        try {
            await handler();
        } catch (error) {
            logger.error('Shutdown', `Handler failed: ${error.message}`);
        }
    }
}

/**
 * Safe async execution wrapper
 * @param {Function} fn - Async function to execute
 * @param {string} context - Context for error logging
 * @returns {Function} Wrapped function
 */
function safeAsync(fn, context = 'Unknown') {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            logger.error(context, `Error: ${error.message}`);
            throw error;
        }
    };
}

/**
 * Wrap an async function with error handling and optional retry
 * @param {Function} fn - Async function
 * @param {Object} options - Options
 * @returns {Function} Wrapped function
 */
function withErrorHandling(fn, options = {}) {
    const {
        context = 'Unknown',
        retries = 0,
        retryDelay = 1000,
        onError = null,
        rethrow = true
    } = options;

    return async (...args) => {
        let lastError;
        
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await fn(...args);
            } catch (error) {
                lastError = error;
                logger.error(context, `Attempt ${attempt + 1} failed: ${error.message}`);
                
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, retryDelay * (attempt + 1)));
                }
            }
        }

        if (onError) {
            try {
                return await onError(lastError, ...args);
            } catch {}
        }

        if (rethrow) {
            throw lastError;
        }
    };
}

/**
 * Execute with timeout
 * @param {Function} fn - Async function
 * @param {number} timeout - Timeout in ms
 * @param {string} context - Context for error
 */
async function withTimeout(fn, timeout, context = 'Operation') {
    return Promise.race([
        fn(),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`${context} timed out after ${timeout}ms`)), timeout)
        )
    ]);
}

/**
 * Create error boundary for Discord interactions
 * @param {Function} fn - Handler function
 * @param {Object} options - Options
 */
function interactionErrorBoundary(fn, options = {}) {
    const { ephemeral = true } = options;
    
    return async (interaction, ...args) => {
        try {
            return await fn(interaction, ...args);
        } catch (error) {
            logger.error('Interaction', `${interaction.commandName}: ${error.message}`);
            
            const errorMessage = AppError.isOperationalError(error)
                ? error.message
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
            } catch {}
        }
    };
}

module.exports = {
    initializeErrorHandlers,
    handleShutdown,
    registerShutdownHandler,
    safeAsync,
    withErrorHandling,
    withTimeout,
    interactionErrorBoundary
};
