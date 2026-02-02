/**
 * Sentry Error Tracking Integration
 * Captures and reports errors to Sentry for monitoring
 * @module core/sentry
 */

const Sentry = require('@sentry/node');
const logger = require('./Logger');

// Track if Sentry is initialized
let isInitialized = false;

/**
 * Initialize Sentry error tracking
 * @param {Object} options - Sentry options
 * @returns {boolean} Whether initialization was successful
 */
function initialize(options = {}) {
    const dsn = process.env.SENTRY_DSN;
    
    if (!dsn) {
        logger.warn('Sentry', 'SENTRY_DSN not set, error tracking disabled');
        return false;
    }

    try {
        Sentry.init({
            dsn,
            environment: process.env.NODE_ENV || 'development',
            release: options.release || process.env.npm_package_version || '1.0.0',
            
            // Performance monitoring (optional)
            tracesSampleRate: options.tracesSampleRate || 0.1,
            
            // Filter sensitive data
            beforeSend(event, hint) {
                // Remove sensitive data from error reports
                if (event.extra) {
                    delete event.extra.BOT_TOKEN;
                    delete event.extra.token;
                    delete event.extra.password;
                }
                
                // Filter out expected/operational errors
                const error = hint?.originalException;
                if (error && isOperationalError(error)) {
                    return null; // Don't send operational errors
                }
                
                return event;
            },
            
            // Add custom tags
            initialScope: {
                tags: {
                    component: 'discord-bot',
                    ...options.tags
                }
            },
            
            ...options
        });

        isInitialized = true;
        logger.info('Sentry', 'Error tracking initialized');
        return true;
    } catch (error) {
        logger.error('Sentry', `Failed to initialize: ${error.message}`);
        return false;
    }
}

/**
 * Check if error is operational (expected) vs programmer error
 * Operational errors should not be sent to Sentry
 * @param {Error} error 
 * @returns {boolean}
 */
function isOperationalError(error) {
    // Check for our custom AppError
    if (error.isOperational === true) {
        return true;
    }
    
    // Discord.js specific errors that are "normal"
    const operationalMessages = [
        'Unknown Message',
        'Unknown Interaction',
        'Missing Permissions',
        'Missing Access',
        'Cannot send messages to this user',
        'Interaction has already been acknowledged',
        'Unknown Channel',
        'Unknown Guild'
    ];
    
    return operationalMessages.some(msg => 
        error.message?.includes(msg)
    );
}

/**
 * Capture an exception
 * @param {Error} error - Error to capture
 * @param {Object} context - Additional context
 */
function captureException(error, context = {}) {
    if (!isInitialized) {
        return;
    }

    if (isOperationalError(error)) {
        return; // Don't send operational errors
    }

    Sentry.withScope(scope => {
        // Add context
        if (context.user) {
            scope.setUser({
                id: context.user.id,
                username: context.user.tag || context.user.username
            });
        }
        
        if (context.guild) {
            scope.setTag('guild_id', context.guild.id);
            scope.setTag('guild_name', context.guild.name);
        }
        
        if (context.command) {
            scope.setTag('command', context.command);
        }
        
        if (context.extra) {
            scope.setExtras(context.extra);
        }
        
        if (context.level) {
            scope.setLevel(context.level);
        }

        Sentry.captureException(error);
    });
}

/**
 * Capture a message
 * @param {string} message - Message to capture
 * @param {string} level - Log level (info, warning, error)
 * @param {Object} context - Additional context
 */
function captureMessage(message, level = 'info', context = {}) {
    if (!isInitialized) {
        return;
    }

    Sentry.withScope(scope => {
        if (context.tags) {
            Object.entries(context.tags).forEach(([key, value]) => {
                scope.setTag(key, value);
            });
        }
        
        if (context.extra) {
            scope.setExtras(context.extra);
        }

        Sentry.captureMessage(message, level);
    });
}

/**
 * Set user context for subsequent events
 * @param {Object} user - User info
 */
function setUser(user) {
    if (!isInitialized) return;
    
    Sentry.setUser({
        id: user.id,
        username: user.tag || user.username
    });
}

/**
 * Clear user context
 */
function clearUser() {
    if (!isInitialized) return;
    Sentry.setUser(null);
}

/**
 * Add breadcrumb for debugging
 * @param {Object} breadcrumb - Breadcrumb data
 */
function addBreadcrumb(breadcrumb) {
    if (!isInitialized) return;
    
    Sentry.addBreadcrumb({
        category: breadcrumb.category || 'default',
        message: breadcrumb.message,
        level: breadcrumb.level || 'info',
        data: breadcrumb.data
    });
}

/**
 * Create a transaction for performance monitoring
 * @param {string} name - Transaction name
 * @param {string} op - Operation type
 * @returns {Object|null} Transaction or null if not initialized
 */
function startTransaction(name, op = 'command') {
    if (!isInitialized) return null;
    
    return Sentry.startTransaction({
        name,
        op
    });
}

/**
 * Flush pending events before shutdown
 * @param {number} timeout - Timeout in ms
 */
async function flush(timeout = 2000) {
    if (!isInitialized) return;
    
    try {
        await Sentry.flush(timeout);
        logger.debug('Sentry', 'Flushed pending events');
    } catch (error) {
        logger.error('Sentry', `Flush failed: ${error.message}`);
    }
}

/**
 * Close Sentry SDK
 */
async function close() {
    if (!isInitialized) return;
    
    try {
        await Sentry.close(2000);
        isInitialized = false;
        logger.info('Sentry', 'Closed');
    } catch (error) {
        logger.error('Sentry', `Close failed: ${error.message}`);
    }
}

/**
 * Check if Sentry is initialized
 * @returns {boolean}
 */
function isEnabled() {
    return isInitialized;
}

module.exports = {
    initialize,
    captureException,
    captureMessage,
    setUser,
    clearUser,
    addBreadcrumb,
    startTransaction,
    flush,
    close,
    isEnabled
};
