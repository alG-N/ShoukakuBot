import logger from '../observability/Logger.js';
import type {
    HealthCheckEntry,
    HealthCheckResult,
    HealthResponse,
    HealthStatus
} from '../../types/core/health.js';
import { healthChecks, healthState } from './state.js';

export function registerHealthCheck(name: string, checkFn: () => Promise<HealthCheckResult>): void {
    healthChecks.set(name, checkFn);
    logger.debug('Health', `Registered health check: ${name}`);
}

export async function runHealthChecks(): Promise<HealthResponse> {
    const results: HealthResponse = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - healthState.startTime) / 1000),
        checks: {}
    };

    const entries = [...healthChecks.entries()];
    const checkPromises = entries.map(async ([name, checkFn]): Promise<[string, HealthCheckEntry]> => {
        try {
            const startTime = Date.now();
            const result = await Promise.race([
                checkFn(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Health check timeout')), 5000)
                )
            ]);

            return [name, {
                status: result.healthy ? 'healthy' : 'unhealthy',
                latency: Date.now() - startTime,
                ...result.details
            }];
        } catch (error) {
            return [name, {
                status: 'unhealthy',
                error: (error as Error).message
            }];
        }
    });

    const settled = await Promise.allSettled(checkPromises);

    for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
            const [name, entry] = outcome.value;
            results.checks[name] = entry;
            if (entry.status === 'unhealthy') {
                results.status = 'unhealthy';
            }
        }
    }

    healthState.checks = results.checks;
    healthState.status = results.status === 'healthy' ? 'healthy' : 'unhealthy';

    return results;
}

export function getHealthStatus(): HealthResponse {
    return {
        status: healthState.status === 'healthy' ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - healthState.startTime) / 1000),
        checks: healthState.checks
    };
}

export function setStatus(status: HealthStatus): void {
    healthState.status = status;
}