/**
 * Sentry Error Tracking Integration
 * Captures and reports errors to Sentry for monitoring
 * @module core/sentry
 */

import * as Sentry from '@sentry/node';
import logger from './Logger.js';
// TYPES
interface SentryInitOptions {
    release?: string;
    tracesSampleRate?: number;
    tags?: Record<string, string>;
    [key: string]: unknown;
}

interface SentryContext {
    user?: { id: string; tag?: string; username?: string };
    guild?: { id: string; name: string };
    command?: string;
    extra?: Record<string, unknown>;
    level?: Sentry.SeverityLevel;
    tags?: Record<string, string>;
}

interface BreadcrumbData {
    category?: string;
    message: string;
    level?: Sentry.SeverityLevel;
    data?: Record<string, unknown>;
}
// STATE
let isInitialized = false;
let initializationFailed = false;
let currentShardId: number | null = null;
// FUNCTIONS
/**
 * Initialize Sentry error tracking
 * @param options - Sentry options
 * @returns Whether initialization was successful
 */
export function initialize(options: SentryInitOptions = {}): boolean {
    const dsn = process.env.SENTRY_DSN;
    
    if (!dsn) {
        logger.warn('Sentry', '⚠️ SENTRY_DSN not set - ERROR TRACKING DISABLED');
        logger.warn('Sentry', 'Production errors will NOT be tracked remotely!');
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
                    delete (event.extra as Record<string, unknown>).BOT_TOKEN;
                    delete (event.extra as Record<string, unknown>).token;
                    delete (event.extra as Record<string, unknown>).password;
                }
                
                // Filter out expected/operational errors
                const error = hint?.originalException;
                if (error && isOperationalError(error as Error)) {
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
        logger.info('Sentry', '✅ Error tracking initialized');
        return true;
    } catch (error) {
        initializationFailed = true;
        logger.error('Sentry', `❌ CRITICAL: Failed to initialize error tracking: ${(error as Error).message}`);
        logger.error('Sentry', 'Production errors will NOT be tracked remotely!');
        console.error('\n❌ CRITICAL: Sentry initialization failed!\n');
        console.error('   Error:', (error as Error).message);
        console.error('   Production errors will go untracked.\n');
        return false;
    }
}

/**
 * Set the shard ID for tagging all subsequent Sentry events.
 * Should be called once after the client is ready.
 * @param shardId - The shard ID (0-based)
 */
export function setShardId(shardId: number): void {
    currentShardId = shardId;
    if (isInitialized) {
        Sentry.setTag('shard_id', String(shardId));
        logger.debug('Sentry', `Shard ID tag set to ${shardId}`);
    }
}

/**
 * Check if Sentry is properly initialized
 * @returns Initialization status
 */
export function isEnabled(): boolean {
    return isInitialized;
}

/**
 * Check if Sentry initialization failed (vs just not configured)
 * @returns Whether initialization explicitly failed
 */
export function hasFailed(): boolean {
    return initializationFailed;
}

/**
 * Check if error is operational (expected) vs programmer error
 * Operational errors should not be sent to Sentry
 * @param error - Error to check
 * @returns Whether error is operational
 */
function isOperationalError(error: Error & { isOperational?: boolean }): boolean {
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
 * @param error - Error to capture
 * @param context - Additional context
 */
export function captureException(error: Error, context: SentryContext = {}): void {
    if (!isInitialized) {
        return;
    }

    if (isOperationalError(error as Error & { isOperational?: boolean })) {
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

        if (currentShardId !== null) {
            scope.setTag('shard_id', String(currentShardId));
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
export function captureMessage(
    message: string, 
    level: Sentry.SeverityLevel = 'info', 
    context: SentryContext = {}
): void {
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
export function setUser(user: { id: string; tag?: string; username?: string }): void {
    if (!isInitialized) return;
    
    Sentry.setUser({
        id: user.id,
        username: user.tag || user.username
    });
}

/**
 * Clear user context
 */
export function clearUser(): void {
    if (!isInitialized) return;
    Sentry.setUser(null);
}

/**
 * Add breadcrumb for debugging
 * @param breadcrumb - Breadcrumb data
 */
export function addBreadcrumb(breadcrumb: BreadcrumbData): void {
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
 * @param name - Transaction name
 * @param op - Operation type
 * @returns Transaction or null if not initialized
 */
export function startTransaction(name: string, op: string = 'command'): Sentry.Span | null {
    if (!isInitialized) return null;
    
    return Sentry.startInactiveSpan({
        name,
        op
    });
}

/**
 * Flush pending events before shutdown
 * @param timeout - Timeout in ms
 */
export async function flush(timeout: number = 2000): Promise<void> {
    if (!isInitialized) return;
    
    try {
        await Sentry.flush(timeout);
        logger.debug('Sentry', 'Flushed pending events');
    } catch (error) {
        logger.error('Sentry', `Flush failed: ${(error as Error).message}`);
    }
}

/**
 * Close Sentry SDK
 */
export async function close(): Promise<void> {
    if (!isInitialized) return;
    
    try {
        await Sentry.close(2000);
        isInitialized = false;
        logger.info('Sentry', 'Closed');
    } catch (error) {
        logger.error('Sentry', `Close failed: ${(error as Error).message}`);
    }
}
