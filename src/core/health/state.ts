import type { HealthCheckResult, HealthState, ServiceConfig } from '../../types/core/health.js';

export const healthState: HealthState = {
    status: 'starting',
    startTime: Date.now(),
    checks: {}
};

export const healthChecks = new Map<string, () => Promise<HealthCheckResult>>();
export const dashboardServices: ServiceConfig = {};