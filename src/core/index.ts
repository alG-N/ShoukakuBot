/**
 * Core Module Index
 * Central exports for core infrastructure
 * @module core
 */
// TYPESCRIPT MODULES
// Logger
export { default as logger } from './Logger.js';
export * from './Logger.js';

// Result Pattern
export { Result } from './Result.js';
export { type ErrorDetails, type ReplyOptions, type DiscordReply, type ResultJSON } from './Result.js';

// Error Codes
export { ErrorCodes, getErrorMessage, isErrorCategory } from './ErrorCodes.js';
export { type CoreErrorCode, type ErrorCategory } from './ErrorCodes.js';

// Circuit Breaker
export * from './CircuitBreaker.js';

// Circuit Breaker Registry
export { 
    circuitBreakerRegistry, 
    CircuitBreakerRegistry, 
    CIRCUIT_CONFIGS 
} from './CircuitBreakerRegistry.js';
export { type RegistryHealth, type RegistrySummary, type FallbackResult } from './CircuitBreakerRegistry.js';

// Client
export { 
    createClient, 
    setPresence, 
    getClientStats, 
    ActivityType,
    CLIENT_OPTIONS 
} from './Client.js';
export { type ClientStats } from './Client.js';

// Shutdown
export { 
    registerShutdownHandler, 
    handleShutdown, 
    initializeShutdownHandlers,
    getIsShuttingDown
} from './shutdown.js';

// Error Handler
export { 
    initializeErrorHandlers,
    safeAsync,
    withErrorHandling,
    withTimeout,
    interactionErrorBoundary
} from './errorHandler.js';

// Sentry
export * as sentry from './sentry.js';
export {
    initialize as initializeSentry,
    captureException,
    captureMessage,
    setUser as setSentryUser,
    clearUser as clearSentryUser,
    addBreadcrumb,
    startTransaction,
    flush as flushSentry,
    close as closeSentry,
    isEnabled as isSentryEnabled
} from './sentry.js';

// Health
export * as health from './health.js';
export {
    registerHealthCheck,
    runHealthChecks,
    getHealthStatus,
    setStatus as setHealthStatus,
    startHealthServer,
    registerDefaultChecks
} from './health.js';

// Graceful Degradation
export { 
    default as gracefulDegradation,
    gracefulDegradation as gracefulDegradationInstance,
    GracefulDegradation, 
    DegradationLevel, 
    ServiceState 
} from './GracefulDegradation.js';



