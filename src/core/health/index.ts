/**
 * Health Module Public API
 * Re-exports health checks, dashboard snapshot generation, and HTTP server setup.
 * @module core/health
 */

export type {
    HealthStatus,
    HealthCheckResult,
    HealthCheckEntry,
    HealthResponse,
    ServiceConfig,
    HealthState
} from '../../types/core/health.js';
export { registerHealthCheck, runHealthChecks, setStatus } from './checks.js';
export { startHealthServer } from './server.js';
export { registerDefaultChecks } from './defaultChecks.js';
export type { DashboardSnapshot } from './snapshot.js';



