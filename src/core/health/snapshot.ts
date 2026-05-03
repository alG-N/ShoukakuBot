import os from 'os';
import type { HealthResponse, HealthStatus, ServiceConfig } from '../../types/core/health.js';
import { runHealthChecks } from './checks.js';
import { dashboardServices, healthState } from './state.js';

export type DashboardSnapshot = {
    generatedAt: string;
    lifecycleStatus: HealthStatus;
    overallStatus: HealthResponse['status'];
    uptimeSeconds: number;
    health: HealthResponse;
    process: Record<string, unknown>;
    discord: Record<string, unknown> | null;
    cache: ReturnType<NonNullable<ServiceConfig['cacheService']>['getStats']> | null;
    lavalink: ReturnType<NonNullable<NonNullable<ServiceConfig['lavalink']>['getNodeStatus']>> | null;
    circuitBreakers: Record<string, unknown> | null;
    degradation: ReturnType<NonNullable<NonNullable<ServiceConfig['gracefulDegradation']>['getStatus']>> | null;
    endpoints: Record<string, string>;
};

export async function buildDashboardData(): Promise<DashboardSnapshot> {
    const health = await runHealthChecks();
    const client = dashboardServices.client;
    const cache = dashboardServices.cacheService?.getStats() ?? null;
    const lavalink = dashboardServices.lavalink?.getNodeStatus?.() ?? null;
    const circuitBreakers = dashboardServices.circuitBreakerRegistry
        ? {
            health: dashboardServices.circuitBreakerRegistry.getHealth(),
            summary: dashboardServices.circuitBreakerRegistry.getSummary()
        }
        : null;
    const degradation = dashboardServices.gracefulDegradation?.getStatus?.() ?? null;

    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();

    const discord = client
        ? {
            ready: client.isReady(),
            pingMs: client.ws.ping,
            guilds: client.guilds.cache.size,
            users: client.guilds.cache.reduce((sum: number, guild) => sum + guild.memberCount, 0),
            channels: client.channels.cache.size,
            shardIds: client.shard?.ids ?? [0],
            shardCount: client.shard?.count ?? 1,
        }
        : null;

    return {
        generatedAt: new Date().toISOString(),
        lifecycleStatus: healthState.status,
        overallStatus: health.status,
        uptimeSeconds: health.uptime,
        health,
        process: {
            pid: process.pid,
            node: process.version,
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname(),
            processUptimeSeconds: Math.floor(process.uptime()),
            rssBytes: memory.rss,
            heapUsedBytes: memory.heapUsed,
            heapTotalBytes: memory.heapTotal,
            externalBytes: memory.external,
            arrayBuffersBytes: memory.arrayBuffers ?? 0,
            cpuUserMicros: cpu.user,
            cpuSystemMicros: cpu.system,
            totalSystemMemoryBytes: os.totalmem(),
            freeSystemMemoryBytes: os.freemem(),
            loadAverage: os.loadavg(),
        },
        discord,
        cache,
        lavalink,
        circuitBreakers,
        degradation,
        endpoints: {
            dashboard: '/',
            dashboardJson: '/dashboard.json',
            stats: '/stats',
            health: '/health',
            ready: '/ready',
            live: '/live',
            metrics: '/metrics',
            grafana: 'http://localhost:3030',
        }
    };
}