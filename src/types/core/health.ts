import type { Client } from 'discord.js';

export type HealthStatus = 'starting' | 'healthy' | 'unhealthy' | 'shutting_down';

export interface HealthCheckResult {
    healthy: boolean;
    details?: Record<string, unknown>;
}

export interface HealthCheckEntry {
    status: 'healthy' | 'unhealthy';
    latency?: number;
    error?: string;
    [key: string]: unknown;
}

export interface HealthResponse {
    status: 'healthy' | 'unhealthy';
    timestamp: string;
    uptime: number;
    checks: Record<string, HealthCheckEntry>;
}

export interface ServiceConfig {
    client?: Client;
    database?: { query: (sql: string) => Promise<unknown> };
    redis?: { isConnected: boolean; client: { ping: () => Promise<unknown> } };
    cacheService?: { getStats: () => { hitRate: number; hits: number; misses: number; absenceChecks: number; memoryEntries: number; redisConnected: boolean } };
    lavalink?: { getNodeStatus?: () => { ready?: boolean; nodes?: unknown[]; activeConnections?: number } };
    circuitBreakerRegistry?: { getHealth: () => { status: string; breakers: Record<string, { state: string }> }; getSummary: () => { total: number; closed: number; open: number; halfOpen: number } };
    gracefulDegradation?: { getStatus: () => { level: string; services: Record<string, unknown>; writeQueues?: Record<string, number> } };
}

export interface HealthState {
    status: HealthStatus;
    startTime: number;
    checks: Record<string, HealthCheckEntry>;
}
