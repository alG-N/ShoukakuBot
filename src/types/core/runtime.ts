export enum DegradationLevel {
    NORMAL = 'NORMAL',
    DEGRADED = 'DEGRADED',
    CRITICAL = 'CRITICAL',
    OFFLINE = 'OFFLINE'
}

export enum ServiceState {
    HEALTHY = 'HEALTHY',
    DEGRADED = 'DEGRADED',
    UNAVAILABLE = 'UNAVAILABLE'
}

export interface ServiceInfo {
    name: string;
    state: ServiceState;
    critical: boolean;
    lastHealthy: number;
    failureCount: number;
    degradedSince: number | null;
}

export interface DegradationServiceOptions {
    critical?: boolean;
}

export interface ExecuteOptions<T> {
    fallback?: (error: Error | null) => Promise<T> | T;
    fallbackValue?: T;
    cacheKey?: string;
}

export interface ExecuteResult<T> {
    success: boolean;
    data: T | null;
    degraded: boolean;
    stale?: boolean;
    cacheAge?: number;
    error?: string;
}

export interface CachedData<T> {
    data: T;
    timestamp: number;
}

export interface QueuedWrite {
    serviceName: string;
    operation: string;
    data: unknown;
    options: Record<string, unknown>;
    timestamp: number;
    retries: number;
}

export interface ServiceStatusInfo {
    state: ServiceState;
    critical: boolean;
    lastHealthy: string | null;
    degradedSince: string | null;
    failureCount: number;
}

export interface SystemStatus {
    level: DegradationLevel;
    timestamp: string;
    services: Record<string, ServiceStatusInfo>;
    queuedWrites: number;
    cacheEntries: number;
}

export interface HealthResult {
    healthy: boolean;
    details: SystemStatus;
}

export type LogLevel = 'DEBUG' | 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'CRITICAL';

export type LogFormat = 'json' | 'text';

export type ConsoleMethods = 'log' | 'info' | 'warn' | 'error';

export type SentrySeverity = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogLevelConfig {
    emoji: string;
    color: number;
    console: ConsoleMethods;
    priority: number;
    name: SentrySeverity;
}

export interface DiscordLogEntry {
    level: LogLevel;
    title: string;
    description: string;
    fields?: Record<string, unknown> | null;
}

export interface LogMetadata {
    [key: string]: unknown;
    error?: string;
    userId?: string;
    guildId?: string;
    shardId?: number;
}

export interface RequestLogOptions {
    method: string;
    url: string;
    statusCode: number;
    duration: number;
    userId?: string;
    guildId?: string;
    error?: Error | null;
}

export interface CommandLogOptions {
    command: string;
    userId: string;
    guildId?: string;
    duration: number;
    success: boolean;
    error?: Error | null;
}

export interface GuildLike {
    id: string;
    name: string;
    memberCount: number;
}

export type CircuitStateType = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface StateChange {
    from: CircuitStateType;
    to: CircuitStateType;
    timestamp: string;
}

export interface CircuitMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    rejectedRequests: number;
    timeouts: number;
    fallbackExecutions: number;
    stateChanges: StateChange[];
}

export interface CircuitBreakerOptions {
    name?: string;
    failureThreshold?: number;
    successThreshold?: number;
    timeout?: number;
    resetTimeout?: number;
    fallback?: (error: Error) => unknown;
    isFailure?: (error: Error) => boolean;
    enabled?: boolean;
}

export interface CircuitBreakerMetrics extends CircuitMetrics {
    name: string;
    state: CircuitStateType;
    failureCount: number;
    successCount: number;
    lastFailureTime: number | null;
    nextAttempt: number | null;
    successRate: string;
}

export interface CircuitHealth {
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    state: CircuitStateType;
    failureCount: number;
    lastFailure: string | null;
    nextAttempt: string | null;
}

export interface CircuitBreakerError extends Error {
    code?: string;
    circuitBreaker?: string;
}
