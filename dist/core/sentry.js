"use strict";
/**
 * Sentry Error Tracking Integration
 * Captures and reports errors to Sentry for monitoring
 * @module core/sentry
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialize = initialize;
exports.isEnabled = isEnabled;
exports.hasFailed = hasFailed;
exports.captureException = captureException;
exports.captureMessage = captureMessage;
exports.setUser = setUser;
exports.clearUser = clearUser;
exports.addBreadcrumb = addBreadcrumb;
exports.startTransaction = startTransaction;
exports.flush = flush;
exports.close = close;
const Sentry = __importStar(require("@sentry/node"));
const Logger_1 = __importDefault(require("./Logger"));
// STATE
let isInitialized = false;
let initializationFailed = false;
// FUNCTIONS
/**
 * Initialize Sentry error tracking
 * @param options - Sentry options
 * @returns Whether initialization was successful
 */
function initialize(options = {}) {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
        Logger_1.default.warn('Sentry', '⚠️ SENTRY_DSN not set - ERROR TRACKING DISABLED');
        Logger_1.default.warn('Sentry', 'Production errors will NOT be tracked remotely!');
        console.warn('\n⚠️  WARNING: Sentry error tracking is DISABLED (no SENTRY_DSN)\n');
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
        Logger_1.default.info('Sentry', '✅ Error tracking initialized');
        return true;
    }
    catch (error) {
        initializationFailed = true;
        Logger_1.default.error('Sentry', `❌ CRITICAL: Failed to initialize error tracking: ${error.message}`);
        Logger_1.default.error('Sentry', 'Production errors will NOT be tracked remotely!');
        console.error('\n❌ CRITICAL: Sentry initialization failed!\n');
        console.error('   Error:', error.message);
        console.error('   Production errors will go untracked.\n');
        return false;
    }
}
/**
 * Check if Sentry is properly initialized
 * @returns Initialization status
 */
function isEnabled() {
    return isInitialized;
}
/**
 * Check if Sentry initialization failed (vs just not configured)
 * @returns Whether initialization explicitly failed
 */
function hasFailed() {
    return initializationFailed;
}
/**
 * Check if error is operational (expected) vs programmer error
 * Operational errors should not be sent to Sentry
 * @param error - Error to check
 * @returns Whether error is operational
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
    return operationalMessages.some(msg => error.message?.includes(msg));
}
/**
 * Capture an exception
 * @param error - Error to capture
 * @param context - Additional context
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
 * @param message - Message to capture
 * @param level - Log level (info, warning, error)
 * @param context - Additional context
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
 * @param user - User info
 */
function setUser(user) {
    if (!isInitialized)
        return;
    Sentry.setUser({
        id: user.id,
        username: user.tag || user.username
    });
}
/**
 * Clear user context
 */
function clearUser() {
    if (!isInitialized)
        return;
    Sentry.setUser(null);
}
/**
 * Add breadcrumb for debugging
 * @param breadcrumb - Breadcrumb data
 */
function addBreadcrumb(breadcrumb) {
    if (!isInitialized)
        return;
    Sentry.addBreadcrumb({
        category: breadcrumb.category || 'default',
        message: breadcrumb.message,
        level: breadcrumb.level || 'info',
        data: breadcrumb.data
    });
}
/**
 * Create a transaction for performance monitoring
 * @param name - Transaction name
 * @param op - Operation type
 * @returns Transaction or null if not initialized
 */
function startTransaction(name, op = 'command') {
    if (!isInitialized)
        return null;
    return Sentry.startInactiveSpan({
        name,
        op
    });
}
/**
 * Flush pending events before shutdown
 * @param timeout - Timeout in ms
 */
async function flush(timeout = 2000) {
    if (!isInitialized)
        return;
    try {
        await Sentry.flush(timeout);
        Logger_1.default.debug('Sentry', 'Flushed pending events');
    }
    catch (error) {
        Logger_1.default.error('Sentry', `Flush failed: ${error.message}`);
    }
}
/**
 * Close Sentry SDK
 */
async function close() {
    if (!isInitialized)
        return;
    try {
        await Sentry.close(2000);
        isInitialized = false;
        Logger_1.default.info('Sentry', 'Closed');
    }
    catch (error) {
        Logger_1.default.error('Sentry', `Close failed: ${error.message}`);
    }
}
//# sourceMappingURL=sentry.js.map