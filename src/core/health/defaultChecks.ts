import type { ServiceConfig } from '../../types/core/health.js';
import { registerHealthCheck } from './checks.js';
import { dashboardServices } from './state.js';

export function registerDefaultChecks(services: ServiceConfig = {}): void {
    Object.assign(dashboardServices, services);

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

    if (services.lavalink) {
        registerHealthCheck('lavalink', async () => {
            const status = services.lavalink!.getNodeStatus?.() || {};
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
                        Object.entries(health.breakers).map(([name, breaker]) => [name, breaker.state])
                    )
                }
            };
        });
    }

    if (services.gracefulDegradation) {
        registerHealthCheck('degradation', async () => {
            const status = services.gracefulDegradation!.getStatus();
            return {
                healthy: status.level !== 'critical' && status.level !== 'offline',
                details: {
                    level: status.level,
                    services: status.services,
                    queuedWrites: status.queuedWrites ?? 0,
                    cacheEntries: status.cacheEntries ?? 0,
                }
            };
        });
    }
}