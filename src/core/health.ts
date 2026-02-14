/**
 * Health Check Service
 * Provides health status for the application
 * Used by load balancers, Kubernetes probes, and monitoring
 * @module core/health
 */

import * as http from 'http';
import type { Server, IncomingMessage, ServerResponse } from 'http';
import type { Client } from 'discord.js';
import logger from './Logger.js';
import { getMetrics, getContentType } from './metrics.js';
// TYPES
type HealthStatus = 'starting' | 'healthy' | 'unhealthy' | 'shutting_down';

interface HealthCheckResult {
    healthy: boolean;
    details?: Record<string, unknown>;
}

interface HealthCheckEntry {
    status: 'healthy' | 'unhealthy';
    latency?: number;
    error?: string;
    [key: string]: unknown;
}

interface HealthResponse {
    status: 'healthy' | 'unhealthy';
    timestamp: string;
    uptime: number;
    checks: Record<string, HealthCheckEntry>;
}

interface ServiceConfig {
    client?: Client;
    database?: { query: (sql: string) => Promise<unknown> };
    redis?: { isConnected: boolean; client: { ping: () => Promise<unknown> } };
    cacheService?: { getStats: () => { hitRate: number; hits: number; misses: number; absenceChecks: number; memoryEntries: number; redisConnected: boolean } };
    lavalink?: { getNodeStatus?: () => { ready?: boolean; nodes?: unknown[]; activeConnections?: number } };
    circuitBreakerRegistry?: { getHealth: () => { status: string; breakers: Record<string, { state: string }> }; getSummary: () => { total: number; closed: number; open: number; halfOpen: number } };
    gracefulDegradation?: { getStatus: () => { level: string; services: Record<string, unknown>; writeQueues?: Record<string, number> } };
}
// STATE
interface HealthState {
    status: HealthStatus;
    startTime: number;
    checks: Record<string, HealthCheckEntry>;
}

const healthState: HealthState = {
    status: 'starting',
    startTime: Date.now(),
    checks: {}
};

// Registered health checks
const healthChecks = new Map<string, () => Promise<HealthCheckResult>>();
// FUNCTIONS
/**
 * Register a health check
 * @param name - Check name
 * @param checkFn - Async function returning { healthy: boolean, details?: object }
 */
export function registerHealthCheck(name: string, checkFn: () => Promise<HealthCheckResult>): void {
    healthChecks.set(name, checkFn);
    logger.debug('Health', `Registered health check: ${name}`);
}

/**
 * Run all health checks (in parallel)
 * @returns Health status
 */
export async function runHealthChecks(): Promise<HealthResponse> {
    const results: HealthResponse = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - healthState.startTime) / 1000),
        checks: {}
    };

    // Run all checks in parallel with individual timeouts
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

/**
 * Get current health status (cached, fast)
 * @returns Current health state
 */
export function getHealthStatus(): HealthResponse {
    return {
        status: healthState.status === 'healthy' ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - healthState.startTime) / 1000),
        checks: healthState.checks
    };
}

/**
 * Set the overall status
 * @param status - New status
 */
export function setStatus(status: HealthStatus): void {
    healthState.status = status;
}

/**
 * Start the health check HTTP server
 * @param port - Port to listen on (default: 3000)
 * @returns HTTP server instance
 */
export function startHealthServer(port: number = 3000): Server {
    const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');

        if (req.url === '/health' || req.url === '/healthz') {
            try {
                const health = await runHealthChecks();
                const statusCode = health.status === 'healthy' ? 200 : 503;
                res.writeHead(statusCode);
                res.end(JSON.stringify(health, null, 2));
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ status: 'error', error: (error as Error).message }));
            }
        } else if (req.url === '/ready' || req.url === '/readyz') {
            // Readiness probe - quick check, no deep health checks
            const status = healthState.status;
            const ready = status === 'healthy';
            res.writeHead(ready ? 200 : 503);
            res.end(JSON.stringify({ ready, status }));
        } else if (req.url === '/live' || req.url === '/livez') {
            // Liveness probe - just check if process is alive
            res.writeHead(200);
            res.end(JSON.stringify({ alive: true }));
        } else if (req.url === '/metrics') {
            // Prometheus metrics endpoint
            try {
                const metrics = await getMetrics();
                res.setHeader('Content-Type', getContentType());
                res.writeHead(200);
                res.end(metrics);
            } catch (error) {
                res.writeHead(500);
                res.end(`# Error collecting metrics: ${(error as Error).message}`);
            }
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    });

    server.listen(port, () => {
        logger.info('Health', `Health check server listening on port ${port}`);
    });

    server.on('error', (error: Error) => {
        logger.error('Health', `Health server error: ${error.message}`);
    });

    return server;
}

/**
 * Create default health checks for common services
 * @param services - Services to check
 */
export function registerDefaultChecks(services: ServiceConfig = {}): void {
    // Discord client check
    if (services.client) {
        registerHealthCheck('discord', async () => {
            const client = services.client!;
            return {
                healthy: client.isReady(),
                details: {
                    ping: client.ws.ping,
                    guilds: client.guilds.cache.size,
                    uptime: client.uptime
                }
            };
        });
    }

    // PostgreSQL check
    if (services.database) {
        registerHealthCheck('postgres', async () => {
            try {
                await services.database!.query('SELECT 1');
                return { healthy: true, details: { connected: true } };
            } catch (error) {
                return { healthy: false, details: { error: (error as Error).message } };
            }
        });
    }

    // Redis check
    if (services.redis) {
        registerHealthCheck('redis', async () => {
            try {
                if (services.redis!.isConnected) {
                    await services.redis!.client.ping();
                    return { healthy: true, details: { connected: true } };
                }
                return { healthy: true, details: { connected: false, fallback: 'in-memory' } };
            } catch (error) {
                return { healthy: false, details: { error: (error as Error).message } };
            }
        });
    }

    // Cache service check (if provided)
    if (services.cacheService) {
        registerHealthCheck('cache', async () => {
            const stats = services.cacheService!.getStats();
            return {
                healthy: true,
                details: {
                    hitRate: Math.round(stats.hitRate * 100) + '%',
                    hits: stats.hits,
                    misses: stats.misses,
                    absenceChecks: stats.absenceChecks,
                    memoryEntries: stats.memoryEntries,
                    redisConnected: stats.redisConnected
                }
            };
        });
    }

    // Lavalink check
    if (services.lavalink) {
        registerHealthCheck('lavalink', async () => {
            const status = services.lavalink!.getNodeStatus?.() || {};
            // Consider healthy if ready OR if we have nodes (node might be connecting)
            const nodeCount = status.nodes?.length || 0;
            const isHealthy = status.ready === true || nodeCount > 0;
            return {
                healthy: isHealthy,
                details: {
                    ready: status.ready,
                    nodes: nodeCount,
                    players: status.activeConnections || 0
                }
            };
        });
    }

    // Circuit Breaker check
    if (services.circuitBreakerRegistry) {
        registerHealthCheck('circuitBreakers', async () => {
            const health = services.circuitBreakerRegistry!.getHealth();
            const summary = services.circuitBreakerRegistry!.getSummary();
            return {
                healthy: health.status !== 'unhealthy',
                details: {
                    status: health.status,
                    total: summary.total,
                    closed: summary.closed,
                    open: summary.open,
                    halfOpen: summary.halfOpen,
                    breakers: Object.fromEntries(
                        Object.entries(health.breakers).map(([name, b]) => [name, b.state])
                    )
                }
            };
        });
    }

    // Graceful Degradation check
    if (services.gracefulDegradation) {
        registerHealthCheck('degradation', async () => {
            const status = services.gracefulDegradation!.getStatus();
            return {
                healthy: status.level !== 'critical' && status.level !== 'offline',
                details: {
                    level: status.level,
                    services: status.services,
                    pendingWrites: Object.fromEntries(
                        Object.entries(status.writeQueues || {}).map(([k, v]) => [k, v])
                    )
                }
            };
        });
    }
}
