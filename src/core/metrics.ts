/**
 * Prometheus Metrics Service
 * 
 * Exposes application metrics for monitoring via Prometheus/Grafana
 * 
 * Metrics Categories:
 * - Discord: gateway latency, guilds, users, shards
 * - Commands: execution count, duration, errors
 * - Music: active players, queue sizes, voice connections
 * - Cache: hit/miss ratio, Redis status
 * - System: memory, CPU, event loop lag
 * 
 * @module core/metrics
 */

import client, {
    Registry,
    Counter,
    Gauge,
    Histogram,
    collectDefaultMetrics
} from 'prom-client';

// ═══════════════════════════════════════════════════════════════
// REGISTRY SETUP
// ═══════════════════════════════════════════════════════════════

// Create a custom registry
const register = new Registry();

// Add default Node.js metrics (memory, CPU, event loop, etc.)
collectDefaultMetrics({
    register,
    prefix: 'altergolden_',
    labels: { app: 'altergolden' }
});

// ═══════════════════════════════════════════════════════════════
// DISCORD METRICS
// ═══════════════════════════════════════════════════════════════

/**
 * Discord gateway latency in milliseconds
 */
export const discordGatewayLatency = new Gauge({
    name: 'altergolden_discord_gateway_latency_ms',
    help: 'Discord WebSocket gateway latency in milliseconds',
    labelNames: ['shard_id'],
    registers: [register]
});

/**
 * Total guilds the bot is in
 */
export const discordGuildsTotal = new Gauge({
    name: 'altergolden_discord_guilds_total',
    help: 'Total number of guilds the bot is in',
    labelNames: ['shard_id'],
    registers: [register]
});

/**
 * Total users across all guilds
 */
export const discordUsersTotal = new Gauge({
    name: 'altergolden_discord_users_total',
    help: 'Total number of users across all guilds',
    labelNames: ['shard_id'],
    registers: [register]
});

/**
 * Total channels across all guilds
 */
export const discordChannelsTotal = new Gauge({
    name: 'altergolden_discord_channels_total',
    help: 'Total number of channels across all guilds',
    labelNames: ['shard_id'],
    registers: [register]
});

/**
 * Bot uptime in seconds
 */
export const discordUptime = new Gauge({
    name: 'altergolden_discord_uptime_seconds',
    help: 'Bot uptime in seconds',
    registers: [register]
});

// ═══════════════════════════════════════════════════════════════
// COMMAND METRICS
// ═══════════════════════════════════════════════════════════════

/**
 * Total commands executed
 */
export const commandsExecutedTotal = new Counter({
    name: 'altergolden_commands_executed_total',
    help: 'Total number of commands executed',
    labelNames: ['command', 'category', 'status'],
    registers: [register]
});

/**
 * Command execution duration
 */
export const commandExecutionDuration = new Histogram({
    name: 'altergolden_command_execution_duration_seconds',
    help: 'Command execution duration in seconds',
    labelNames: ['command', 'category'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register]
});

/**
 * Command errors
 */
export const commandErrorsTotal = new Counter({
    name: 'altergolden_command_errors_total',
    help: 'Total number of command errors',
    labelNames: ['command', 'category', 'error_type'],
    registers: [register]
});

/**
 * Active command executions (currently running)
 */
export const commandsActive = new Gauge({
    name: 'altergolden_commands_active',
    help: 'Number of commands currently being executed',
    labelNames: ['command'],
    registers: [register]
});

// ═══════════════════════════════════════════════════════════════
// MUSIC METRICS
// ═══════════════════════════════════════════════════════════════

/**
 * Active music players
 */
export const musicPlayersActive = new Gauge({
    name: 'altergolden_music_players_active',
    help: 'Number of active music players',
    registers: [register]
});

/**
 * Total tracks in all queues
 */
export const musicQueueSize = new Gauge({
    name: 'altergolden_music_queue_size_total',
    help: 'Total number of tracks across all queues',
    registers: [register]
});

/**
 * Voice connections
 */
export const musicVoiceConnections = new Gauge({
    name: 'altergolden_music_voice_connections',
    help: 'Number of active voice connections',
    registers: [register]
});

/**
 * Tracks played total
 */
export const musicTracksPlayedTotal = new Counter({
    name: 'altergolden_music_tracks_played_total',
    help: 'Total number of tracks played',
    labelNames: ['source'],
    registers: [register]
});

/**
 * Lavalink node status
 */
export const lavalinkNodeStatus = new Gauge({
    name: 'altergolden_lavalink_node_status',
    help: 'Lavalink node status (1=connected, 0=disconnected)',
    labelNames: ['node_name'],
    registers: [register]
});

/**
 * Lavalink node players
 */
export const lavalinkNodePlayers = new Gauge({
    name: 'altergolden_lavalink_node_players',
    help: 'Number of players on each Lavalink node',
    labelNames: ['node_name'],
    registers: [register]
});

// ═══════════════════════════════════════════════════════════════
// CACHE METRICS
// ═══════════════════════════════════════════════════════════════

/**
 * Cache operations
 */
export const cacheOperationsTotal = new Counter({
    name: 'altergolden_cache_operations_total',
    help: 'Total cache operations',
    labelNames: ['operation', 'namespace', 'result'],
    registers: [register]
});

/**
 * Cache hit ratio
 */
export const cacheHitRatio = new Gauge({
    name: 'altergolden_cache_hit_ratio',
    help: 'Cache hit ratio (0-1)',
    labelNames: ['namespace'],
    registers: [register]
});

/**
 * Redis connection status
 */
export const redisConnectionStatus = new Gauge({
    name: 'altergolden_redis_connection_status',
    help: 'Redis connection status (1=connected, 0=disconnected)',
    registers: [register]
});

/**
 * Redis latency
 */
export const redisLatency = new Histogram({
    name: 'altergolden_redis_latency_seconds',
    help: 'Redis operation latency in seconds',
    labelNames: ['operation'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
    registers: [register]
});

// ═══════════════════════════════════════════════════════════════
// DATABASE METRICS
// ═══════════════════════════════════════════════════════════════

/**
 * Database queries
 */
export const databaseQueriesTotal = new Counter({
    name: 'altergolden_database_queries_total',
    help: 'Total database queries',
    labelNames: ['operation', 'table', 'status'],
    registers: [register]
});

/**
 * Database query duration
 */
export const databaseQueryDuration = new Histogram({
    name: 'altergolden_database_query_duration_seconds',
    help: 'Database query duration in seconds',
    labelNames: ['operation', 'table'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [register]
});

/**
 * Database connection pool
 */
export const databasePoolSize = new Gauge({
    name: 'altergolden_database_pool_size',
    help: 'Database connection pool size',
    labelNames: ['state'],
    registers: [register]
});

// ═══════════════════════════════════════════════════════════════
// CIRCUIT BREAKER METRICS
// ═══════════════════════════════════════════════════════════════

/**
 * Circuit breaker state
 */
export const circuitBreakerState = new Gauge({
    name: 'altergolden_circuit_breaker_state',
    help: 'Circuit breaker state (0=closed, 0.5=half-open, 1=open)',
    labelNames: ['service'],
    registers: [register]
});

/**
 * Circuit breaker failures
 */
export const circuitBreakerFailures = new Counter({
    name: 'altergolden_circuit_breaker_failures_total',
    help: 'Total circuit breaker failures',
    labelNames: ['service'],
    registers: [register]
});

// ═══════════════════════════════════════════════════════════════
// AUTOMOD METRICS
// ═══════════════════════════════════════════════════════════════

/**
 * AutoMod violations
 */
export const automodViolationsTotal = new Counter({
    name: 'altergolden_automod_violations_total',
    help: 'Total AutoMod violations detected',
    labelNames: ['type', 'action'],
    registers: [register]
});

/**
 * AutoMod actions taken
 */
export const automodActionsTotal = new Counter({
    name: 'altergolden_automod_actions_total',
    help: 'Total AutoMod actions taken',
    labelNames: ['action'],
    registers: [register]
});

// ═══════════════════════════════════════════════════════════════
// EVENT METRICS
// ═══════════════════════════════════════════════════════════════

/**
 * Discord events received
 */
export const discordEventsTotal = new Counter({
    name: 'altergolden_discord_events_total',
    help: 'Total Discord events received',
    labelNames: ['event_type'],
    registers: [register]
});

// ═══════════════════════════════════════════════════════════════
// HTTP METRICS (for health endpoint)
// ═══════════════════════════════════════════════════════════════

/**
 * HTTP requests
 */
export const httpRequestsTotal = new Counter({
    name: 'altergolden_http_requests_total',
    help: 'Total HTTP requests to health/metrics endpoints',
    labelNames: ['method', 'path', 'status_code'],
    registers: [register]
});

/**
 * HTTP request duration
 */
export const httpRequestDuration = new Histogram({
    name: 'altergolden_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'path'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [register]
});

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get all metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
    return await register.metrics();
}

/**
 * Get metrics content type
 */
export function getContentType(): string {
    return register.contentType;
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
    register.resetMetrics();
}

/**
 * Track command execution
 */
export function trackCommand(
    command: string,
    category: string,
    durationMs: number,
    status: 'success' | 'error',
    errorType?: string
): void {
    const durationSeconds = durationMs / 1000;
    
    commandsExecutedTotal.inc({ command, category, status });
    commandExecutionDuration.observe({ command, category }, durationSeconds);
    
    if (status === 'error' && errorType) {
        commandErrorsTotal.inc({ command, category, error_type: errorType });
    }
}

/**
 * Track cache operation
 */
export function trackCacheOperation(
    namespace: string,
    operation: 'get' | 'set' | 'delete',
    hit: boolean
): void {
    const result = operation === 'get' ? (hit ? 'hit' : 'miss') : 'ok';
    cacheOperationsTotal.inc({ operation, namespace, result });
}

/**
 * Track database query
 */
export function trackDatabaseQuery(
    operation: string,
    table: string,
    durationMs: number,
    success: boolean
): void {
    const durationSeconds = durationMs / 1000;
    const status = success ? 'success' : 'error';
    
    databaseQueriesTotal.inc({ operation, table, status });
    databaseQueryDuration.observe({ operation, table }, durationSeconds);
}

/**
 * Track AutoMod violation
 */
export function trackAutomodViolation(type: string, action: string): void {
    automodViolationsTotal.inc({ type, action });
    automodActionsTotal.inc({ action });
}

/**
 * Update Discord metrics
 */
export function updateDiscordMetrics(data: {
    shardId?: number;
    ping?: number;
    guilds?: number;
    users?: number;
    channels?: number;
    uptime?: number;
}): void {
    const labels = { shard_id: String(data.shardId ?? 0) };
    
    if (data.ping !== undefined) {
        discordGatewayLatency.set(labels, data.ping);
    }
    if (data.guilds !== undefined) {
        discordGuildsTotal.set(labels, data.guilds);
    }
    if (data.users !== undefined) {
        discordUsersTotal.set(labels, data.users);
    }
    if (data.channels !== undefined) {
        discordChannelsTotal.set(labels, data.channels);
    }
    if (data.uptime !== undefined) {
        discordUptime.set(data.uptime / 1000); // Convert to seconds
    }
}

/**
 * Update music metrics
 */
export function updateMusicMetrics(data: {
    activePlayers?: number;
    totalQueueSize?: number;
    voiceConnections?: number;
}): void {
    if (data.activePlayers !== undefined) {
        musicPlayersActive.set(data.activePlayers);
    }
    if (data.totalQueueSize !== undefined) {
        musicQueueSize.set(data.totalQueueSize);
    }
    if (data.voiceConnections !== undefined) {
        musicVoiceConnections.set(data.voiceConnections);
    }
}

/**
 * Update Lavalink node metrics
 */
export function updateLavalinkMetrics(nodeName: string, connected: boolean, players: number): void {
    lavalinkNodeStatus.set({ node_name: nodeName }, connected ? 1 : 0);
    lavalinkNodePlayers.set({ node_name: nodeName }, players);
}

/**
 * Update circuit breaker metrics
 */
export function updateCircuitBreakerMetrics(service: string, state: 'closed' | 'half-open' | 'open'): void {
    const stateValue = state === 'closed' ? 0 : state === 'half-open' ? 0.5 : 1;
    circuitBreakerState.set({ service }, stateValue);
}

/**
 * Track circuit breaker failure
 */
export function trackCircuitBreakerFailure(service: string): void {
    circuitBreakerFailures.inc({ service });
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export { register, client as promClient };

export default {
    register,
    getMetrics,
    getContentType,
    resetMetrics,
    trackCommand,
    trackCacheOperation,
    trackDatabaseQuery,
    trackAutomodViolation,
    updateDiscordMetrics,
    updateMusicMetrics,
    updateLavalinkMetrics,
    updateCircuitBreakerMetrics,
    trackCircuitBreakerFailure,
    // Individual metrics for direct access
    discordGatewayLatency,
    discordGuildsTotal,
    discordUsersTotal,
    discordChannelsTotal,
    discordUptime,
    commandsExecutedTotal,
    commandExecutionDuration,
    commandErrorsTotal,
    commandsActive,
    musicPlayersActive,
    musicQueueSize,
    musicVoiceConnections,
    musicTracksPlayedTotal,
    lavalinkNodeStatus,
    lavalinkNodePlayers,
    cacheOperationsTotal,
    cacheHitRatio,
    redisConnectionStatus,
    redisLatency,
    databaseQueriesTotal,
    databaseQueryDuration,
    databasePoolSize,
    circuitBreakerState,
    circuitBreakerFailures,
    automodViolationsTotal,
    automodActionsTotal,
    discordEventsTotal,
    httpRequestsTotal,
    httpRequestDuration
};
