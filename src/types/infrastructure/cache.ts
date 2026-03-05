export interface NamespaceConfig {
    ttl: number;
    maxSize: number;
    useRedis: boolean;
}

export interface MemoryCacheEntry<T = unknown> {
    value: T;
    expiresAt: number;
}

export interface CacheMetrics {
    hits: number;
    misses: number;
    absenceChecks: number;
    writes: number;
    deletes: number;
    errors: number;
    redisHits: number;
    memoryHits: number;
    redisFallbacks: number;
    specializedOps: number;
    namespaceStats: Map<string, { hits: number; misses: number }>;
}

export interface CacheServiceStats extends Omit<CacheMetrics, 'namespaceStats'> {
    hitRate: number;
    effectiveHitRate: number;
    redisConnected: boolean;
    redisState: string;
    redisFailures: number;
    memoryEntries: number;
    namespaces: string[];
    topMissNamespaces: Array<{ namespace: string; hits: number; misses: number; hitRate: number }>;
}

export interface CacheServiceOptions {
    maxRedisFailures?: number;
    cleanupIntervalMs?: number;
}

export type CacheFactory<T> = () => Promise<T>;

export interface CacheTTL {
    GUILD_SETTINGS: number;
    USER_PREFERENCES: number;
    COOLDOWN: number;
    API_RESPONSE: number;
    MUSIC_QUEUE: number;
    SPAM_WINDOW: number;
    DUPLICATE_WINDOW: number;
    RATE_LIMIT: number;
    AUTOMOD_WARN: number;
}

export interface FallbackEntry {
    value: unknown;
    expiresAt: number;
}

export interface SpamTracker {
    count: number;
    start: number;
}

export interface DuplicateTracker {
    hash: string;
    count: number;
    start: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetIn: number;
}

export interface DuplicateResult {
    count: number;
    isNew: boolean;
}

export interface GuildCacheStats {
    connected: boolean;
    fallbackSize: number;
    redisInfo: string | null;
}
