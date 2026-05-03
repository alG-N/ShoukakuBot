/**
 * Core Observability Category
 * @module core/observability
 */

export { default as logger } from './Logger.js';
export * from './Logger.js';

export * from './metrics.js';

export * as health from '../health/index.js';
export {
    registerHealthCheck,
    runHealthChecks,
    setStatus as setHealthStatus,
    startHealthServer,
    registerDefaultChecks
} from '../health/index.js';

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