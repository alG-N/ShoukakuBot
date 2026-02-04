/**
 * Core Module Index
 * Central exports for core infrastructure
 * @module core
 */
// TYPESCRIPT MODULES
// Logger
export { default as logger, Logger, LOG_LEVELS, LOG_CHANNEL_ID } from './Logger';
export type { LogLevel, LogFormat, LogMetadata, RequestLogOptions } from './Logger';

// Result Pattern
export { Result } from './Result';
export type { ErrorDetails, ReplyOptions, DiscordReply, ResultJSON } from './Result';

// Error Codes
export { ErrorCodes, getErrorMessage, isErrorCategory } from './ErrorCodes';
export type { ErrorCode, ErrorCategory } from './ErrorCodes';

// Circuit Breaker
export { CircuitBreaker, CircuitState } from './CircuitBreaker';
export type { 
    CircuitStateType,
    CircuitBreakerOptions,
    CircuitMetrics,
    CircuitBreakerMetrics,
    CircuitHealth,
    StateChange
} from './CircuitBreaker';

// Circuit Breaker Registry
export { 
    circuitBreakerRegistry, 
    CircuitBreakerRegistry, 
    CIRCUIT_CONFIGS 
} from './CircuitBreakerRegistry';
export type { RegistryHealth, RegistrySummary, FallbackResult } from './CircuitBreakerRegistry';

// Client
export { 
    createClient, 
    setPresence, 
    getClientStats, 
    ActivityType,
    CLIENT_OPTIONS 
} from './Client';
export type { ClientStats } from './Client';

// Bootstrap
export { 
    bootstrap, 
    healthCheck as bootstrapHealthCheck, 
    BOOTSTRAP_CONFIG 
} from './bootstrap';

// Shutdown
export { 
    registerShutdownHandler, 
    handleShutdown, 
    initializeShutdownHandlers,
    getIsShuttingDown
} from './shutdown';

// Error Handler
export { 
    initializeErrorHandlers,
    safeAsync,
    withErrorHandling,
    withTimeout,
    interactionErrorBoundary
} from './errorHandler';

// Sentry
export * as sentry from './sentry';
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
} from './sentry';

// Health
export * as health from './health';
export {
    registerHealthCheck,
    runHealthChecks,
    getHealthStatus,
    setStatus as setHealthStatus,
    startHealthServer,
    registerDefaultChecks
} from './health';

// Graceful Degradation
export { 
    default as gracefulDegradation,
    gracefulDegradation as gracefulDegradationInstance,
    GracefulDegradation, 
    DegradationLevel, 
    ServiceState 
} from './GracefulDegradation';
// COMMONJS COMPATIBILITY
// Re-export for CommonJS compatibility
module.exports = {
    // Logger
    logger: require('./Logger').default,
    Logger: require('./Logger').Logger,
    LOG_CHANNEL_ID: require('./Logger').LOG_CHANNEL_ID,
    LOG_LEVELS: require('./Logger').LOG_LEVELS,
    
    // Result
    Result: require('./Result').Result,
    
    // Error Codes
    ErrorCodes: require('./ErrorCodes').ErrorCodes,
    getErrorMessage: require('./ErrorCodes').getErrorMessage,
    isErrorCategory: require('./ErrorCodes').isErrorCategory,
    
    // Circuit Breaker
    CircuitBreaker: require('./CircuitBreaker').CircuitBreaker,
    CircuitState: require('./CircuitBreaker').CircuitState,
    circuitBreakerRegistry: require('./CircuitBreakerRegistry').circuitBreakerRegistry,
    CircuitBreakerRegistry: require('./CircuitBreakerRegistry').CircuitBreakerRegistry,
    CIRCUIT_CONFIGS: require('./CircuitBreakerRegistry').CIRCUIT_CONFIGS,
    
    // Client
    createClient: require('./Client').createClient,
    setPresence: require('./Client').setPresence,
    getClientStats: require('./Client').getClientStats,
    ActivityType: require('./Client').ActivityType,
    CLIENT_OPTIONS: require('./Client').CLIENT_OPTIONS,
    
    // Bootstrap
    bootstrap: require('./bootstrap').bootstrap,
    bootstrapHealthCheck: require('./bootstrap').healthCheck,
    BOOTSTRAP_CONFIG: require('./bootstrap').BOOTSTRAP_CONFIG,
    
    // Shutdown
    registerShutdownHandler: require('./shutdown').registerShutdownHandler,
    handleShutdown: require('./shutdown').handleShutdown,
    initializeShutdownHandlers: require('./shutdown').initializeShutdownHandlers,
    getIsShuttingDown: require('./shutdown').getIsShuttingDown,
    
    // Error Handler
    initializeErrorHandlers: require('./errorHandler').initializeErrorHandlers,
    safeAsync: require('./errorHandler').safeAsync,
    withErrorHandling: require('./errorHandler').withErrorHandling,
    withTimeout: require('./errorHandler').withTimeout,
    interactionErrorBoundary: require('./errorHandler').interactionErrorBoundary,
    
    // Sentry
    sentry: require('./sentry'),
    initializeSentry: require('./sentry').initialize,
    captureException: require('./sentry').captureException,
    captureMessage: require('./sentry').captureMessage,
    
    // Health
    health: require('./health'),
    registerHealthCheck: require('./health').registerHealthCheck,
    runHealthChecks: require('./health').runHealthChecks,
    getHealthStatus: require('./health').getHealthStatus,
    startHealthServer: require('./health').startHealthServer,
    registerDefaultChecks: require('./health').registerDefaultChecks,
    
    // Graceful Degradation
    gracefulDegradation: require('./GracefulDegradation').default,
    GracefulDegradation: require('./GracefulDegradation').GracefulDegradation,
    DegradationLevel: require('./GracefulDegradation').DegradationLevel,
    ServiceState: require('./GracefulDegradation').ServiceState,
};
