"use strict";
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
exports.gracefulDegradationInstance = exports.gracefulDegradation = exports.registerDefaultChecks = exports.startHealthServer = exports.setHealthStatus = exports.getHealthStatus = exports.runHealthChecks = exports.registerHealthCheck = exports.health = exports.isSentryEnabled = exports.closeSentry = exports.flushSentry = exports.startTransaction = exports.addBreadcrumb = exports.clearSentryUser = exports.setSentryUser = exports.captureMessage = exports.captureException = exports.initializeSentry = exports.sentry = exports.interactionErrorBoundary = exports.withTimeout = exports.withErrorHandling = exports.safeAsync = exports.initializeErrorHandlers = exports.getIsShuttingDown = exports.initializeShutdownHandlers = exports.handleShutdown = exports.registerShutdownHandler = exports.BOOTSTRAP_CONFIG = exports.bootstrapHealthCheck = exports.bootstrap = exports.CLIENT_OPTIONS = exports.ActivityType = exports.getClientStats = exports.setPresence = exports.createClient = exports.CIRCUIT_CONFIGS = exports.CircuitBreakerRegistry = exports.circuitBreakerRegistry = exports.CircuitState = exports.CircuitBreaker = exports.isErrorCategory = exports.getErrorMessage = exports.ErrorCodes = exports.Result = exports.LOG_CHANNEL_ID = exports.LOG_LEVELS = exports.Logger = exports.logger = void 0;
exports.ServiceState = exports.DegradationLevel = exports.GracefulDegradation = void 0;
/**
 * Core Module Index
 * Central exports for core infrastructure
 * @module core
 */
// TYPESCRIPT MODULES
// Logger
var Logger_1 = require("./Logger");
Object.defineProperty(exports, "logger", { enumerable: true, get: function () { return __importDefault(Logger_1).default; } });
Object.defineProperty(exports, "Logger", { enumerable: true, get: function () { return Logger_1.Logger; } });
Object.defineProperty(exports, "LOG_LEVELS", { enumerable: true, get: function () { return Logger_1.LOG_LEVELS; } });
Object.defineProperty(exports, "LOG_CHANNEL_ID", { enumerable: true, get: function () { return Logger_1.LOG_CHANNEL_ID; } });
// Result Pattern
var Result_1 = require("./Result");
Object.defineProperty(exports, "Result", { enumerable: true, get: function () { return Result_1.Result; } });
// Error Codes
var ErrorCodes_1 = require("./ErrorCodes");
Object.defineProperty(exports, "ErrorCodes", { enumerable: true, get: function () { return ErrorCodes_1.ErrorCodes; } });
Object.defineProperty(exports, "getErrorMessage", { enumerable: true, get: function () { return ErrorCodes_1.getErrorMessage; } });
Object.defineProperty(exports, "isErrorCategory", { enumerable: true, get: function () { return ErrorCodes_1.isErrorCategory; } });
// Circuit Breaker
var CircuitBreaker_1 = require("./CircuitBreaker");
Object.defineProperty(exports, "CircuitBreaker", { enumerable: true, get: function () { return CircuitBreaker_1.CircuitBreaker; } });
Object.defineProperty(exports, "CircuitState", { enumerable: true, get: function () { return CircuitBreaker_1.CircuitState; } });
// Circuit Breaker Registry
var CircuitBreakerRegistry_1 = require("./CircuitBreakerRegistry");
Object.defineProperty(exports, "circuitBreakerRegistry", { enumerable: true, get: function () { return CircuitBreakerRegistry_1.circuitBreakerRegistry; } });
Object.defineProperty(exports, "CircuitBreakerRegistry", { enumerable: true, get: function () { return CircuitBreakerRegistry_1.CircuitBreakerRegistry; } });
Object.defineProperty(exports, "CIRCUIT_CONFIGS", { enumerable: true, get: function () { return CircuitBreakerRegistry_1.CIRCUIT_CONFIGS; } });
// Client
var Client_1 = require("./Client");
Object.defineProperty(exports, "createClient", { enumerable: true, get: function () { return Client_1.createClient; } });
Object.defineProperty(exports, "setPresence", { enumerable: true, get: function () { return Client_1.setPresence; } });
Object.defineProperty(exports, "getClientStats", { enumerable: true, get: function () { return Client_1.getClientStats; } });
Object.defineProperty(exports, "ActivityType", { enumerable: true, get: function () { return Client_1.ActivityType; } });
Object.defineProperty(exports, "CLIENT_OPTIONS", { enumerable: true, get: function () { return Client_1.CLIENT_OPTIONS; } });
// Bootstrap
var bootstrap_1 = require("./bootstrap");
Object.defineProperty(exports, "bootstrap", { enumerable: true, get: function () { return bootstrap_1.bootstrap; } });
Object.defineProperty(exports, "bootstrapHealthCheck", { enumerable: true, get: function () { return bootstrap_1.healthCheck; } });
Object.defineProperty(exports, "BOOTSTRAP_CONFIG", { enumerable: true, get: function () { return bootstrap_1.BOOTSTRAP_CONFIG; } });
// Shutdown
var shutdown_1 = require("./shutdown");
Object.defineProperty(exports, "registerShutdownHandler", { enumerable: true, get: function () { return shutdown_1.registerShutdownHandler; } });
Object.defineProperty(exports, "handleShutdown", { enumerable: true, get: function () { return shutdown_1.handleShutdown; } });
Object.defineProperty(exports, "initializeShutdownHandlers", { enumerable: true, get: function () { return shutdown_1.initializeShutdownHandlers; } });
Object.defineProperty(exports, "getIsShuttingDown", { enumerable: true, get: function () { return shutdown_1.getIsShuttingDown; } });
// Error Handler
var errorHandler_1 = require("./errorHandler");
Object.defineProperty(exports, "initializeErrorHandlers", { enumerable: true, get: function () { return errorHandler_1.initializeErrorHandlers; } });
Object.defineProperty(exports, "safeAsync", { enumerable: true, get: function () { return errorHandler_1.safeAsync; } });
Object.defineProperty(exports, "withErrorHandling", { enumerable: true, get: function () { return errorHandler_1.withErrorHandling; } });
Object.defineProperty(exports, "withTimeout", { enumerable: true, get: function () { return errorHandler_1.withTimeout; } });
Object.defineProperty(exports, "interactionErrorBoundary", { enumerable: true, get: function () { return errorHandler_1.interactionErrorBoundary; } });
// Sentry
exports.sentry = __importStar(require("./sentry"));
var sentry_1 = require("./sentry");
Object.defineProperty(exports, "initializeSentry", { enumerable: true, get: function () { return sentry_1.initialize; } });
Object.defineProperty(exports, "captureException", { enumerable: true, get: function () { return sentry_1.captureException; } });
Object.defineProperty(exports, "captureMessage", { enumerable: true, get: function () { return sentry_1.captureMessage; } });
Object.defineProperty(exports, "setSentryUser", { enumerable: true, get: function () { return sentry_1.setUser; } });
Object.defineProperty(exports, "clearSentryUser", { enumerable: true, get: function () { return sentry_1.clearUser; } });
Object.defineProperty(exports, "addBreadcrumb", { enumerable: true, get: function () { return sentry_1.addBreadcrumb; } });
Object.defineProperty(exports, "startTransaction", { enumerable: true, get: function () { return sentry_1.startTransaction; } });
Object.defineProperty(exports, "flushSentry", { enumerable: true, get: function () { return sentry_1.flush; } });
Object.defineProperty(exports, "closeSentry", { enumerable: true, get: function () { return sentry_1.close; } });
Object.defineProperty(exports, "isSentryEnabled", { enumerable: true, get: function () { return sentry_1.isEnabled; } });
// Health
exports.health = __importStar(require("./health"));
var health_1 = require("./health");
Object.defineProperty(exports, "registerHealthCheck", { enumerable: true, get: function () { return health_1.registerHealthCheck; } });
Object.defineProperty(exports, "runHealthChecks", { enumerable: true, get: function () { return health_1.runHealthChecks; } });
Object.defineProperty(exports, "getHealthStatus", { enumerable: true, get: function () { return health_1.getHealthStatus; } });
Object.defineProperty(exports, "setHealthStatus", { enumerable: true, get: function () { return health_1.setStatus; } });
Object.defineProperty(exports, "startHealthServer", { enumerable: true, get: function () { return health_1.startHealthServer; } });
Object.defineProperty(exports, "registerDefaultChecks", { enumerable: true, get: function () { return health_1.registerDefaultChecks; } });
// Graceful Degradation
var GracefulDegradation_1 = require("./GracefulDegradation");
Object.defineProperty(exports, "gracefulDegradation", { enumerable: true, get: function () { return __importDefault(GracefulDegradation_1).default; } });
Object.defineProperty(exports, "gracefulDegradationInstance", { enumerable: true, get: function () { return GracefulDegradation_1.gracefulDegradation; } });
Object.defineProperty(exports, "GracefulDegradation", { enumerable: true, get: function () { return GracefulDegradation_1.GracefulDegradation; } });
Object.defineProperty(exports, "DegradationLevel", { enumerable: true, get: function () { return GracefulDegradation_1.DegradationLevel; } });
Object.defineProperty(exports, "ServiceState", { enumerable: true, get: function () { return GracefulDegradation_1.ServiceState; } });
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
//# sourceMappingURL=index.js.map