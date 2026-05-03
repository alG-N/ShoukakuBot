/**
 * Core Module Index
 * Central exports for core infrastructure
 * @module core
 */

export * as runtime from './runtime/index.js';
export * as errors from './errors/index.js';
export * as observability from './observability/index.js';
export * as resilience from './resilience/index.js';

// TYPESCRIPT MODULES
// Logger
export { default as logger } from './observability/Logger.js';
export * from './observability/Logger.js';

// Result Pattern
export { Result } from './errors/Result.js';
export { type ErrorDetails, type ReplyOptions, type DiscordReply, type ResultJSON } from './errors/Result.js';

// Error Codes
export { ErrorCodes, getErrorMessage, isErrorCategory } from './errors/ErrorCodes.js';
export { type CoreErrorCode, type ErrorCategory } from './errors/ErrorCodes.js';

// Circuit Breaker
export * from './resilience/CircuitBreaker.js';

// Circuit Breaker Registry
export { 
    circuitBreakerRegistry, 
    CircuitBreakerRegistry, 
    CIRCUIT_CONFIGS 
} from './resilience/CircuitBreakerRegistry.js';
export { type RegistryHealth, type RegistrySummary, type FallbackResult } from './resilience/CircuitBreakerRegistry.js';

// Client
export { 
    createClient, 
    setPresence, 
    getClientStats, 
    ActivityType,
    CLIENT_OPTIONS 
} from './runtime/Client.js';
export { type ClientStats } from './runtime/Client.js';

// Shutdown
export { 
    registerShutdownHandler, 
    handleShutdown, 
    initializeShutdownHandlers,
    getIsShuttingDown
} from './runtime/shutdown.js';

// Error Handler
export { 
    initializeErrorHandlers,
    safeAsync,
    withErrorHandling,
    withTimeout,
    interactionErrorBoundary
} from './errors/errorHandler.js';

// Sentry
export * as sentry from './observability/sentry.js';
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
} from './observability/sentry.js';

// Health
export * as health from './health/index.js';
export {
    registerHealthCheck,
    runHealthChecks,
    getHealthStatus,
    setStatus as setHealthStatus,
    startHealthServer,
    registerDefaultChecks
} from './health/index.js';

// Graceful Degradation
export { 
    default as gracefulDegradation,
    gracefulDegradation as gracefulDegradationInstance,
    GracefulDegradation, 
    DegradationLevel, 
    ServiceState 
} from './resilience/GracefulDegradation.js';



