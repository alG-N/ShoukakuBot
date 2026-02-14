/**
 * Unified Cache Service
 * Single interface for all caching needs
 * Supports Redis (distributed) with in-memory fallback
 * Integrates with GracefulDegradation for automatic failover
 * @module cache/CacheService
 */

import type { Redis } from 'ioredis';
import gracefulDegradation from '../core/GracefulDegradation.js';
import logger from '../core/Logger.js';
// TYPES & INTERFACES
/**
 * Cache namespace configuration
 */
export interface NamespaceConfig {
    /** Default TTL in seconds */
    ttl: number;
    /** Max entries (for in-memory) */
    maxSize: number;
    /** Whether to use Redis for this namespace */
    useRedis: boolean;
}

/**
 * Cache entry stored in memory
 */
interface MemoryCacheEntry<T = unknown> {
    value: T;
    expiresAt: number;
}

/**
 * Cache service metrics
 */
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
    /** Total specialized operations (cooldowns, rate limits, automod) not tracked in hit/miss */
    specializedOps: number;
    /** Per-namespace hit/miss counters */
    namespaceStats: Map<string, { hits: number; misses: number }>;
}

/**
 * Cache statistics with service state
 */
export interface CacheServiceStats extends Omit<CacheMetrics, 'namespaceStats'> {
    hitRate: number;
    /** Effective hit rate including getOrSet and peek operations */
    effectiveHitRate: number;
    redisConnected: boolean;
    redisState: string;
    redisFailures: number;
    memoryEntries: number;
    namespaces: string[];
    /** Top namespaces by miss count (for optimization) */
    topMissNamespaces: Array<{ namespace: string; hits: number; misses: number; hitRate: number }>;
}

/**
 * Options for CacheService constructor
 */
export interface CacheServiceOptions {
    maxRedisFailures?: number;
    cleanupIntervalMs?: number;
}

/**
 * Factory function for getOrSet pattern
 */
export type CacheFactory<T> = () => Promise<T>;
// DEFAULT CONFIGURATION
/**
 * Default namespace configurations
 */
export const DEFAULT_NAMESPACES: Record<string, NamespaceConfig> = {
    'guild': { ttl: 300, maxSize: 1000, useRedis: true },      // Guild settings - 5min
    'api:nhentai': { ttl: 300, maxSize: 300, useRedis: true },   // nhentai galleries/search - 5min
    'api:anime': { ttl: 600, maxSize: 400, useRedis: true },     // AniList + MAL + stale fallback - 10min
    'api:search': { ttl: 300, maxSize: 200, useRedis: true },    // Google, Wikipedia, Fandom - 5min
    'api:translate': { ttl: 1800, maxSize: 100, useRedis: true }, // Pixiv translations - 30min
    'music': { ttl: 3600, maxSize: 200, useRedis: true },      // Music queues - 1h
    'automod': { ttl: 60, maxSize: 5000, useRedis: true },     // AutoMod tracking - 1min
    'ratelimit': { ttl: 60, maxSize: 10000, useRedis: true },  // Rate limits - 1min
    'snipe': { ttl: 43200, maxSize: 500, useRedis: true },     // Snipe messages - 12h
    'lockdown': { ttl: 86400, maxSize: 200, useRedis: true },  // Lockdown state - 24h
    'antiraid': { ttl: 3600, maxSize: 500, useRedis: true },   // Anti-raid tracking - 1h
    'voice': { ttl: 600, maxSize: 200, useRedis: true },       // Voice state tracking - 10min
    'temp': { ttl: 60, maxSize: 1000, useRedis: false },       // Temporary - 1min, memory only
    'pixiv_auth': { ttl: 3600, maxSize: 10, useRedis: true },  // Pixiv OAuth tokens - 1h, cross-shard
    'reddit_auth': { ttl: 3600, maxSize: 10, useRedis: true }, // Reddit OAuth tokens - 1h, cross-shard
    'maintenance': { ttl: 2592000, maxSize: 10, useRedis: true }, // Maintenance state - 30d, cross-shard
};

/**
 * Default temp namespace config for fallback
 */
const DEFAULT_TEMP_CONFIG: NamespaceConfig = { ttl: 60, maxSize: 1000, useRedis: false };
// CACHE SERVICE CLASS
/**
 * Unified cache service with Redis + memory fallback
 */
export class CacheService {
    /** Redis client instance */
    private redis: Redis | null = null;
    
    /** Whether Redis is currently connected */
    private isRedisConnected: boolean = false;
    
    /** In-memory cache storage by namespace */
    private memoryCache: Map<string, Map<string, MemoryCacheEntry>>;
    
    /** Namespace configurations */
    private namespaces: Map<string, NamespaceConfig>;
    
    /** Performance metrics */
    private metrics: CacheMetrics;
    
    /** Consecutive Redis failures */
    private redisFailures: number = 0;
    
    /** Max failures before marking degraded */
    private maxRedisFailures: number;
    
    /** Cleanup interval reference */
    private _cleanupInterval: NodeJS.Timeout;

    /** Flag to suppress miss metric during peek() — used only for existence
     *  checks where null is the expected/normal result (lockdown, antiraid, etc.) */
    private _suppressMissMetric: boolean = false;

    /** Track a hit for a namespace */
    private _trackNamespaceHit(namespace: string): void {
        const ns = this.metrics.namespaceStats.get(namespace) || { hits: 0, misses: 0 };
        ns.hits++;
        this.metrics.namespaceStats.set(namespace, ns);
    }

    /** Track a miss for a namespace */
    private _trackNamespaceMiss(namespace: string): void {
        const ns = this.metrics.namespaceStats.get(namespace) || { hits: 0, misses: 0 };
        ns.misses++;
        this.metrics.namespaceStats.set(namespace, ns);
    }

    constructor(options: CacheServiceOptions = {}) {
        this.memoryCache = new Map();
        this.namespaces = new Map(Object.entries(DEFAULT_NAMESPACES));
        this.maxRedisFailures = options.maxRedisFailures || 3;
        
        // Initialize metrics
        this.metrics = {
            hits: 0,
            misses: 0,
            absenceChecks: 0,
            writes: 0,
            deletes: 0,
            errors: 0,
            redisHits: 0,
            memoryHits: 0,
            redisFallbacks: 0,
            specializedOps: 0,
            namespaceStats: new Map(),
        };
        
        // Cleanup interval for memory cache
        // Use .unref() to allow process to exit gracefully even if interval is running
        this._cleanupInterval = setInterval(
            () => this._cleanupMemory(), 
            options.cleanupIntervalMs || 60000
        );
        this._cleanupInterval.unref();
    }

    /**
     * Initialize with Redis connection
     * @param redisClient - ioredis client instance
     */
    setRedis(redisClient: Redis | null): void {
        this.redis = redisClient;
        this.isRedisConnected = !!redisClient;
        
        if (redisClient) {
            // Register with graceful degradation
            gracefulDegradation.initialize();
            gracefulDegradation.registerFallback('redis', async () => null); // Fallback returns null (cache miss)
            
            // Recover any pending write queue from previous session
            // Pass Redis client directly to avoid circular dependency timing issues
            gracefulDegradation.recoverWriteQueue(redisClient).catch((err: Error) => {
                logger.error('CacheService', `Failed to recover write queue: ${err.message}`);
            });
            
            // Listen for Redis errors
            redisClient.on('error', (error: Error) => {
                this._handleRedisError(error);
            });
            
            redisClient.on('connect', () => {
                this._handleRedisReconnect();
            });
        }
        
        logger.info('CacheService', `Redis ${this.isRedisConnected ? 'connected' : 'not available'}`);
    }

    /**
     * Handle Redis error
     */
    private _handleRedisError(error: Error): void {
        this.redisFailures++;
        logger.error('CacheService', `Redis error (${this.redisFailures}/${this.maxRedisFailures}): ${error.message}`);
        
        if (this.redisFailures >= this.maxRedisFailures) {
            gracefulDegradation.markDegraded('redis', 'Too many failures');
            this.isRedisConnected = false;
        }
    }

    /**
     * Handle Redis reconnection
     */
    private _handleRedisReconnect(): void {
        this.redisFailures = 0;
        this.isRedisConnected = true;
        
        gracefulDegradation.markHealthy('redis');
        
        logger.info('CacheService', 'Redis reconnected');
    }

    /**
     * Register a new namespace with custom config
     * @param namespace - Namespace name
     * @param config - Namespace configuration
     */
    registerNamespace(namespace: string, config: Partial<NamespaceConfig>): void {
        this.namespaces.set(namespace, {
            ttl: config.ttl || 300,
            maxSize: config.maxSize || 1000,
            useRedis: config.useRedis !== false,
        });
    }

    /**
     * Build full cache key
     */
    private _buildKey(namespace: string, key: string): string {
        return `${namespace}:${key}`;
    }

    /**
     * Get namespace config
     */
    private _getNamespaceConfig(namespace: string): NamespaceConfig {
        return this.namespaces.get(namespace) ?? DEFAULT_TEMP_CONFIG;
    }

    /**
     * Get value from cache
     * @param namespace - Cache namespace
     * @param key - Cache key
     * @returns Cached value or null
     */
    async get<T = unknown>(namespace: string, key: string): Promise<T | null> {
        const fullKey = this._buildKey(namespace, key);
        const config = this._getNamespaceConfig(namespace);

        try {
            // Try Redis first if enabled and connected
            if (config.useRedis && this.isRedisConnected && this.redis) {
                try {
                    const value = await this.redis.get(fullKey);
                    if (value !== null) {
                        this.metrics.hits++;
                        this.metrics.redisHits++;
                        this._trackNamespaceHit(namespace);
                        // Reset failures on success
                        this.redisFailures = 0;
                        const parsed = JSON.parse(value) as T;
                        
                        // Write-through to memory on Redis hit for faster subsequent lookups
                        if (!this.memoryCache.has(namespace)) {
                            this.memoryCache.set(namespace, new Map());
                        }
                        const memNs = this.memoryCache.get(namespace)!;
                        if (memNs.size < config.maxSize) {
                            // Use remaining TTL from Redis or default namespace TTL
                            const ttlMs = config.ttl * 1000;
                            memNs.set(key, { value: parsed, expiresAt: Date.now() + ttlMs });
                        }
                        
                        return parsed;
                    }
                } catch (redisError) {
                    // Redis operation failed, mark and fallback
                    this._handleRedisError(redisError as Error);
                    this.metrics.redisFallbacks++;
                }
            }

            // Fallback to memory (either Redis disabled, disconnected, or failed)
            const memNs = this.memoryCache.get(namespace);
            if (memNs) {
                const entry = memNs.get(key);
                if (entry && Date.now() < entry.expiresAt) {
                    this.metrics.hits++;
                    this.metrics.memoryHits++;
                    this._trackNamespaceHit(namespace);
                    return entry.value as T;
                }
                // Clean up expired
                if (entry) memNs.delete(key);
            }

            if (!this._suppressMissMetric) {
                this.metrics.misses++;
                this._trackNamespaceMiss(namespace);
            }
            return null;
        } catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `Get error: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Peek at a value in cache without counting a miss.
     * Use for "existence checks" where null is a normal/expected result
     * (e.g. checking if a channel is locked, if raid mode is active, etc.).
     * Hits are still counted normally.
     * @param namespace - Cache namespace
     * @param key - Cache key
     * @returns Cached value or null
     */
    async peek<T = unknown>(namespace: string, key: string): Promise<T | null> {
        this._suppressMissMetric = true;
        const result = await this.get<T>(namespace, key);
        this._suppressMissMetric = false;
        if (result === null) {
            this.metrics.absenceChecks++;
        }
        return result;
    }

    /**
     * Set value in cache
     * @param namespace - Cache namespace
     * @param key - Cache key
     * @param value - Value to cache
     * @param ttl - TTL in seconds (optional, uses namespace default)
     */
    async set<T = unknown>(namespace: string, key: string, value: T, ttl?: number): Promise<void> {
        const fullKey = this._buildKey(namespace, key);
        const config = this._getNamespaceConfig(namespace);
        const actualTtl = ttl || config.ttl;

        try {
            this.metrics.writes++;

            // Write to Redis if enabled and connected
            if (config.useRedis && this.isRedisConnected && this.redis) {
                try {
                    await this.redis.setex(fullKey, actualTtl, JSON.stringify(value));
                    // Reset failures on success
                    this.redisFailures = 0;
                } catch (redisError) {
                    // Redis write failed, mark and continue to memory
                    this._handleRedisError(redisError as Error);
                    this.metrics.redisFallbacks++;
                }
            }

            // Always write to memory as fallback
            if (!this.memoryCache.has(namespace)) {
                this.memoryCache.set(namespace, new Map());
            }
            
            const memNs = this.memoryCache.get(namespace)!;
            
            // Evict if at capacity
            if (memNs.size >= config.maxSize) {
                this._evictFifo(namespace);
            }
            
            memNs.set(key, {
                value,
                expiresAt: Date.now() + (actualTtl * 1000)
            });
        } catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `Set error: ${(error as Error).message}`);
        }
    }

    /**
     * Delete value from cache
     * @param namespace - Cache namespace
     * @param key - Cache key
     */
    async delete(namespace: string, key: string): Promise<void> {
        const fullKey = this._buildKey(namespace, key);
        const config = this._getNamespaceConfig(namespace);

        try {
            this.metrics.deletes++;

            if (config.useRedis && this.isRedisConnected && this.redis) {
                try {
                    await this.redis.del(fullKey);
                    this.redisFailures = 0;
                } catch (redisError) {
                    this._handleRedisError(redisError as Error);
                }
            }

            const memNs = this.memoryCache.get(namespace);
            if (memNs) memNs.delete(key);
        } catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `Delete error: ${(error as Error).message}`);
        }
    }

    /**
     * Check if key exists
     * @param namespace - Cache namespace
     * @param key - Cache key
     * @returns True if key exists
     */
    async has(namespace: string, key: string): Promise<boolean> {
        return (await this.peek(namespace, key)) !== null;
    }

    /**
     * Get or set (cache-aside pattern)
     * @param namespace - Cache namespace
     * @param key - Cache key
     * @param factory - Async function to get value if not cached
     * @param ttl - TTL in seconds
     * @returns Cached or newly fetched value
     */
    async getOrSet<T = unknown>(
        namespace: string, 
        key: string, 
        factory: CacheFactory<T>, 
        ttl?: number
    ): Promise<T> {
        // DO count misses here — getOrSet misses are real misses and must
        // be reflected in the hit rate so we can optimise effectively.
        const cached = await this.get<T>(namespace, key);

        if (cached !== null) {
            return cached;
        }

        // Cache miss — populate from factory
        const value = await factory();
        await this.set(namespace, key, value, ttl);
        return value;
    }

    /**
     * Increment a counter (useful for rate limiting)
     * @param namespace - Cache namespace
     * @param key - Cache key
     * @param ttl - TTL in seconds
     * @returns New count
     */
    async increment(namespace: string, key: string, ttl?: number): Promise<number> {
        const fullKey = this._buildKey(namespace, key);
        const config = this._getNamespaceConfig(namespace);
        const actualTtl = ttl || config.ttl;

        try {
            if (config.useRedis && this.isRedisConnected && this.redis) {
                const multi = this.redis.multi();
                multi.incr(fullKey);
                multi.expire(fullKey, actualTtl);
                const results = await multi.exec();
                if (results && results[0]) {
                    return results[0][1] as number;
                }
            }

            // Fallback to memory
            if (!this.memoryCache.has(namespace)) {
                this.memoryCache.set(namespace, new Map());
            }
            const memNs = this.memoryCache.get(namespace)!;
            const entry = memNs.get(key);
            
            const currentValue = typeof entry?.value === 'number' ? entry.value : 0;
            const newCount = currentValue + 1;
            memNs.set(key, {
                value: newCount,
                expiresAt: Date.now() + (actualTtl * 1000)
            });
            return newCount;
        } catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `Increment error: ${(error as Error).message}`);
            return 1;
        }
    }

    /**
     * Clear all keys in a namespace
     * @param namespace - Namespace to clear
     */
    async clearNamespace(namespace: string): Promise<void> {
        try {
            const config = this._getNamespaceConfig(namespace);
            
            if (config.useRedis && this.isRedisConnected && this.redis) {
                // Use SCAN instead of KEYS to avoid blocking Redis
                let cursor = '0';
                do {
                    const result = await this.redis.scan(cursor, 'MATCH', `${namespace}:*`, 'COUNT', 100);
                    cursor = result[0];
                    if (result[1].length > 0) {
                        await this.redis.del(...result[1]);
                    }
                } while (cursor !== '0');
            }

            this.memoryCache.delete(namespace);
            logger.debug('CacheService', `Cleared namespace: ${namespace}`);
        } catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `Clear namespace error: ${(error as Error).message}`);
        }
    }

    /**
     * Delete all keys matching a prefix within a namespace
     * @param namespace - Cache namespace
     * @param prefix - Key prefix to match (e.g., 'nhentai:' deletes 'nhentai:gallery_1', 'nhentai:search_x', etc.)
     */
    async deleteByPrefix(namespace: string, prefix: string): Promise<number> {
        let deletedCount = 0;
        try {
            const config = this._getNamespaceConfig(namespace);

            // Delete from Redis using SCAN
            if (config.useRedis && this.isRedisConnected && this.redis) {
                let cursor = '0';
                do {
                    const result = await this.redis.scan(cursor, 'MATCH', `${namespace}:${prefix}*`, 'COUNT', 100);
                    cursor = result[0];
                    if (result[1].length > 0) {
                        await this.redis.del(...result[1]);
                        deletedCount += result[1].length;
                    }
                } while (cursor !== '0');
            }

            // Delete from memory cache
            const memNs = this.memoryCache.get(namespace);
            if (memNs) {
                for (const key of [...memNs.keys()]) {
                    if (key.startsWith(prefix)) {
                        memNs.delete(key);
                        deletedCount++;
                    }
                }
            }

            logger.debug('CacheService', `Deleted ${deletedCount} keys with prefix '${prefix}' in namespace '${namespace}'`);
        } catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `Delete by prefix error: ${(error as Error).message}`);
        }
        return deletedCount;
    }

    /**
     * Get cache statistics
     * @returns Cache statistics with service state
     */
    getStats(): CacheServiceStats {
        const memorySize = [...this.memoryCache.values()]
            .reduce((sum, ns) => sum + ns.size, 0);
        
        const redisState = gracefulDegradation.getServiceState('redis') || 'unknown';
        
        // Only count real get() hits + misses for hit rate (exclude peek absence checks)
        const totalRequests = this.metrics.hits + this.metrics.misses;
        
        // Effective hit rate includes ALL operations: hits, misses, absence checks, specialized ops
        const totalAllOps = this.metrics.hits + this.metrics.misses 
                          + this.metrics.absenceChecks + this.metrics.specializedOps;
        // Specialized ops are "hits" conceptually (they always succeed — counters, cooldowns, etc.)
        const effectiveHits = this.metrics.hits + this.metrics.specializedOps + this.metrics.absenceChecks;
        const effectiveHitRate = totalAllOps > 0 ? effectiveHits / totalAllOps : 0;

        // Build top-miss namespaces sorted by miss count (descending)
        const topMissNamespaces = [...this.metrics.namespaceStats.entries()]
            .map(([namespace, stats]) => ({
                namespace,
                hits: stats.hits,
                misses: stats.misses,
                hitRate: (stats.hits + stats.misses) > 0 
                    ? stats.hits / (stats.hits + stats.misses) 
                    : 0,
            }))
            .sort((a, b) => b.misses - a.misses)
            .slice(0, 10);

        // Destructure to exclude namespaceStats Map (not serializable)
        const { namespaceStats: _ns, ...serializableMetrics } = this.metrics;
        
        return {
            ...serializableMetrics,
            hitRate: totalRequests > 0 ? this.metrics.hits / totalRequests : 0,
            effectiveHitRate,
            redisConnected: this.isRedisConnected,
            redisState,
            redisFailures: this.redisFailures,
            memoryEntries: memorySize,
            namespaces: [...this.namespaces.keys()],
            topMissNamespaces,
        };
    }

    /**
     * Evict first-in entry from namespace (FIFO eviction)
     * Note: This is FIFO, not LRU — it removes the oldest inserted key.
     * For true LRU, entries would need to be re-inserted on access.
     */
    private _evictFifo(namespace: string): void {
        const memNs = this.memoryCache.get(namespace);
        if (!memNs || memNs.size === 0) return;

        // FIFO: delete the first (oldest inserted) entry
        const firstKey = memNs.keys().next().value;
        if (firstKey) {
            memNs.delete(firstKey);
        }
    }

    /**
     * Cleanup expired entries from memory cache
     */
    private _cleanupMemory(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [, entries] of this.memoryCache) {
            for (const [key, entry] of entries) {
                if (now > entry.expiresAt) {
                    entries.delete(key);
                    cleaned++;
                }
            }
        }

        if (cleaned > 0) {
            logger.debug('CacheService', `Cleaned ${cleaned} expired entries`);
        }
    }

    // ==========================================
    // SPECIALIZED METHODS (AutoMod, RateLimit, Guild)
    // ==========================================

    /**
     * Track spam messages for a user in a guild
     * @param guildId - Guild ID
     * @param userId - User ID
     * @param windowSeconds - Time window in seconds
     * @returns Current message count in window
     */
    async trackSpamMessage(guildId: string, userId: string, windowSeconds: number = 5): Promise<number> {
        this.metrics.specializedOps++;
        const key = `spam:${guildId}:${userId}`;
        const namespace = 'automod';

        try {
            const config = this._getNamespaceConfig(namespace);
            
            if (config.useRedis && this.isRedisConnected && this.redis) {
                const multi = this.redis.multi();
                multi.incr(key);
                multi.expire(key, windowSeconds);
                const results = await multi.exec();
                return results?.[0]?.[1] as number ?? 1;
            }

            // Fallback to memory
            const memNs = this._getOrCreateMemoryNamespace(namespace);
            const entry = memNs.get(key);
            const now = Date.now();
            const windowMs = windowSeconds * 1000;
            
            if (entry && now < entry.expiresAt && typeof entry.value === 'number') {
                const newCount = entry.value + 1;
                memNs.set(key, { value: newCount, expiresAt: entry.expiresAt });
                return newCount;
            }
            
            memNs.set(key, { value: 1, expiresAt: now + windowMs });
            return 1;
        } catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `trackSpamMessage error: ${(error as Error).message}`);
            return 1;
        }
    }

    /**
     * Reset spam tracker for a user
     */
    async resetSpamTracker(guildId: string, userId: string): Promise<void> {
        await this.delete('automod', `spam:${guildId}:${userId}`);
    }

    /**
     * Track duplicate messages for a user
     * @returns Object with count and whether it's a new message hash
     */
    async trackDuplicateMessage(
        guildId: string, 
        userId: string, 
        content: string, 
        windowSeconds: number = 30
    ): Promise<{ count: number; isNew: boolean }> {
        this.metrics.specializedOps++;
        const contentHash = Buffer.from(content.toLowerCase().trim()).toString('base64').slice(0, 32);
        const countKey = `dup:${guildId}:${userId}:count`;
        const hashKey = `dup:${guildId}:${userId}:hash`;
        const namespace = 'automod';
        
        try {
            const config = this._getNamespaceConfig(namespace);
            
            if (config.useRedis && this.isRedisConnected && this.redis) {
                const storedHash = await this.redis.get(hashKey);
                
                if (storedHash !== contentHash) {
                    const multi = this.redis.multi();
                    multi.set(hashKey, contentHash, 'EX', windowSeconds);
                    multi.set(countKey, '1', 'EX', windowSeconds);
                    await multi.exec();
                    return { count: 1, isNew: true };
                }
                
                const multi = this.redis.multi();
                multi.incr(countKey);
                multi.expire(countKey, windowSeconds);
                multi.expire(hashKey, windowSeconds);
                const results = await multi.exec();
                return { count: results?.[0]?.[1] as number ?? 1, isNew: false };
            }
            
            // Fallback to memory
            const memNs = this._getOrCreateMemoryNamespace(namespace);
            const now = Date.now();
            const windowMs = windowSeconds * 1000;
            const cacheKey = `dup:${guildId}:${userId}`;
            
            const entry = memNs.get(cacheKey);
            const tracker = entry?.value as { hash: string; count: number } | undefined;
            
            if (!tracker || now >= entry!.expiresAt || tracker.hash !== contentHash) {
                memNs.set(cacheKey, { value: { hash: contentHash, count: 1 }, expiresAt: now + windowMs });
                return { count: 1, isNew: true };
            }
            
            tracker.count++;
            return { count: tracker.count, isNew: false };
        } catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `trackDuplicateMessage error: ${(error as Error).message}`);
            return { count: 1, isNew: true };
        }
    }

    /**
     * Reset duplicate tracker for a user
     */
    async resetDuplicateTracker(guildId: string, userId: string): Promise<void> {
        const namespace = 'automod';
        await this.delete(namespace, `dup:${guildId}:${userId}:count`);
        await this.delete(namespace, `dup:${guildId}:${userId}:hash`);
        
        const memNs = this.memoryCache.get(namespace);
        if (memNs) {
            memNs.delete(`dup:${guildId}:${userId}`);
        }
    }

    /**
     * Track automod warnings for a user
     * @param resetHours - Hours until warning count resets
     * @returns Current warning count
     */
    async trackAutomodWarn(guildId: string, userId: string, resetHours: number = 1): Promise<number> {
        const key = `warn:${guildId}:${userId}`;
        const ttlSeconds = resetHours * 3600;
        return this.increment('automod', key, ttlSeconds);
    }

    /**
     * Get automod warning count for a user
     */
    async getAutomodWarnCount(guildId: string, userId: string): Promise<number> {
        const value = await this.peek<number>('automod', `warn:${guildId}:${userId}`);
        return value ?? 0;
    }

    /**
     * Reset automod warnings for a user
     */
    async resetAutomodWarn(guildId: string, userId: string): Promise<void> {
        await this.delete('automod', `warn:${guildId}:${userId}`);
    }

    /**
     * Check rate limit for a key
     * @param key - Rate limit key
     * @param limit - Max requests allowed
     * @param windowSeconds - Time window in seconds
     * @returns Rate limit result with allowed status and remaining
     */
    async checkRateLimit(
        key: string, 
        limit: number, 
        windowSeconds: number
    ): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
        this.metrics.specializedOps++;
        const fullKey = `ratelimit:${key}`;
        const namespace = 'ratelimit';
        
        try {
            const config = this._getNamespaceConfig(namespace);
            
            if (config.useRedis && this.isRedisConnected && this.redis) {
                const multi = this.redis.multi();
                multi.incr(fullKey);
                multi.ttl(fullKey);
                const results = await multi.exec();
                
                const count = results?.[0]?.[1] as number ?? 0;
                let ttl = results?.[1]?.[1] as number ?? -1;
                
                if (ttl === -1) {
                    await this.redis.expire(fullKey, windowSeconds);
                    ttl = windowSeconds;
                }
                
                const allowed = count <= limit;
                return {
                    allowed,
                    remaining: Math.max(0, limit - count),
                    resetIn: ttl * 1000
                };
            }
            
            // Fallback to memory
            const memNs = this._getOrCreateMemoryNamespace(namespace);
            const now = Date.now();
            const windowMs = windowSeconds * 1000;
            const entry = memNs.get(key);
            
            if (!entry || now >= entry.expiresAt) {
                memNs.set(key, { value: 1, expiresAt: now + windowMs });
                return { allowed: true, remaining: limit - 1, resetIn: windowMs };
            }
            
            const count = (entry.value as number) + 1;
            memNs.set(key, { value: count, expiresAt: entry.expiresAt });
            
            const allowed = count <= limit;
            return {
                allowed,
                remaining: Math.max(0, limit - count),
                resetIn: entry.expiresAt - now
            };
        } catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `checkRateLimit error: ${(error as Error).message}`);
            return { allowed: true, remaining: limit, resetIn: 0 };
        }
    }

    /**
     * Get guild settings from cache
     * @param guildId - Guild ID
     * @returns Cached settings or null
     */
    async getGuildSettings<T = unknown>(guildId: string): Promise<T | null> {
        return this.get<T>('guild', `${guildId}:settings`);
    }

    /**
     * Set guild settings in cache
     * @param guildId - Guild ID
     * @param settings - Settings object
     * @param ttl - TTL in seconds (default 300)
     */
    async setGuildSettings<T = unknown>(guildId: string, settings: T, ttl: number = 300): Promise<void> {
        await this.set('guild', `${guildId}:settings`, settings, ttl);
    }

    /**
     * Invalidate guild settings cache
     * @param guildId - Guild ID
     */
    async invalidateGuildSettings(guildId: string): Promise<void> {
        await this.delete('guild', `${guildId}:settings`);
    }

    /**
     * Get cooldown remaining for a command
     * @param commandName - Command name
     * @param userId - User ID
     * @returns Remaining cooldown in milliseconds or null
     */
    async getCooldown(commandName: string, userId: string): Promise<number | null> {
        this.metrics.specializedOps++;
        const key = `cooldown:${commandName}:${userId}`;
        const namespace = 'ratelimit';
        const fullKey = this._buildKey(namespace, key);
        
        try {
            const config = this._getNamespaceConfig(namespace);
            
            if (config.useRedis && this.isRedisConnected && this.redis) {
                const ttl = await this.redis.ttl(fullKey);
                if (ttl > 0) {
                    return ttl * 1000;
                }
                return null;
            }
            
            // Fallback to memory
            const memNs = this.memoryCache.get(namespace);
            const entry = memNs?.get(key);
            if (entry && Date.now() < entry.expiresAt) {
                return entry.expiresAt - Date.now();
            }
            return null;
        } catch (error) {
            this.metrics.errors++;
            return null;
        }
    }

    /**
     * Set command cooldown
     * @param commandName - Command name
     * @param userId - User ID
     * @param cooldownMs - Cooldown in milliseconds
     */
    async setCooldown(commandName: string, userId: string, cooldownMs: number): Promise<void> {
        const key = `cooldown:${commandName}:${userId}`;
        const ttlSeconds = Math.ceil(cooldownMs / 1000);
        await this.set('ratelimit', key, Date.now(), ttlSeconds);
    }

    /**
     * Check and set cooldown atomically (shard-safe)
     * @param commandName - Command name
     * @param userId - User ID
     * @param cooldownMs - Cooldown in milliseconds
     * @returns Object with passed (true if not on cooldown) and remaining (ms)
     */
    async checkAndSetCooldown(
        commandName: string, 
        userId: string, 
        cooldownMs: number
    ): Promise<{ passed: boolean; remaining: number }> {
        this.metrics.specializedOps++;
        const key = `cooldown:${commandName}:${userId}`;
        const namespace = 'ratelimit';
        const fullKey = this._buildKey(namespace, key);
        const ttlSeconds = Math.ceil(cooldownMs / 1000);

        try {
            const config = this._getNamespaceConfig(namespace);
            
            if (config.useRedis && this.isRedisConnected && this.redis) {
                // Use SETNX for atomic check-and-set
                const result = await this.redis.set(fullKey, Date.now().toString(), 'EX', ttlSeconds, 'NX');
                
                if (result === 'OK') {
                    // Cooldown was set, user passed
                    return { passed: true, remaining: 0 };
                }
                
                // Already exists, get remaining TTL
                const ttl = await this.redis.ttl(fullKey);
                return { passed: false, remaining: ttl > 0 ? ttl * 1000 : 0 };
            }
            
            // Fallback to memory
            const memNs = this._getOrCreateMemoryNamespace(namespace);
            const entry = memNs.get(key);
            const now = Date.now();
            
            if (entry && now < entry.expiresAt) {
                return { passed: false, remaining: entry.expiresAt - now };
            }
            
            memNs.set(key, { value: now, expiresAt: now + cooldownMs });
            return { passed: true, remaining: 0 };
        } catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `checkAndSetCooldown error: ${(error as Error).message}`);
            return { passed: true, remaining: 0 };
        }
    }

    /**
     * Clear cooldown for a user and command
     * @param commandName - Command name
     * @param userId - User ID
     */
    async clearCooldown(commandName: string, userId: string): Promise<void> {
        await this.delete('ratelimit', `cooldown:${commandName}:${userId}`);
    }

    /**
     * Clear all cooldowns for a user
     * @param userId - User ID
     */
    async clearUserCooldowns(userId: string): Promise<void> {
        const namespace = 'ratelimit';
        const pattern = `cooldown:*:${userId}`;
        
        try {
            const config = this._getNamespaceConfig(namespace);
            
            if (config.useRedis && this.isRedisConnected && this.redis) {
                let cursor = '0';
                do {
                    const result = await this.redis.scan(cursor, 'MATCH', `${namespace}:${pattern}`, 'COUNT', 100);
                    cursor = result[0];
                    if (result[1].length > 0) {
                        await this.redis.del(...result[1]);
                    }
                } while (cursor !== '0');
            }
            
            // Also clear from memory
            const memNs = this.memoryCache.get(namespace);
            if (memNs) {
                for (const key of memNs.keys()) {
                    if (key.endsWith(`:${userId}`)) {
                        memNs.delete(key);
                    }
                }
            }
        } catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `clearUserCooldowns error: ${(error as Error).message}`);
        }
    }

    /**
     * Cache API response
     * @param service - Service name
     * @param query - Query string
     * @param response - Response data
     * @param ttl - TTL in seconds (default 300)
     */
    async setApiCache(service: string, query: string, response: unknown, ttl: number = 300): Promise<void> {
        const key = `${service}:${Buffer.from(query).toString('base64').slice(0, 64)}`;
        await this.set('api', key, response, ttl);
    }

    /**
     * Get cached API response
     * @param service - Service name
     * @param query - Query string
     * @returns Cached response or null
     */
    async getApiCache<T = unknown>(service: string, query: string): Promise<T | null> {
        const key = `${service}:${Buffer.from(query).toString('base64').slice(0, 64)}`;
        return this.get<T>('api', key);
    }

    // ==========================================
    // MUSIC STATE METHODS (Shard-Safe)
    // ==========================================

    /**
     * Preserve queue state for a guild (when Lavalink goes down)
     * @param guildId - Guild ID
     * @param state - Queue state to preserve
     * @param ttlSeconds - TTL in seconds (default 30 minutes)
     */
    async preserveQueueState<T = unknown>(guildId: string, state: T, ttlSeconds: number = 1800): Promise<void> {
        await this.set('music', `preserved:${guildId}`, state, ttlSeconds);
    }

    /**
     * Get preserved queue state for a guild
     * @param guildId - Guild ID
     * @returns Preserved state or null
     */
    async getPreservedQueueState<T = unknown>(guildId: string): Promise<T | null> {
        return this.peek<T>('music', `preserved:${guildId}`);
    }

    /**
     * Clear preserved queue state for a guild
     * @param guildId - Guild ID
     */
    async clearPreservedQueueState(guildId: string): Promise<void> {
        await this.delete('music', `preserved:${guildId}`);
    }

    /**
     * Get all preserved queue guild IDs
     * Uses Redis SCAN for efficiency
     * @returns Array of guild IDs with preserved state
     */
    async getAllPreservedQueueGuildIds(): Promise<string[]> {
        const guildIds: string[] = [];
        const namespace = 'music';
        const pattern = 'preserved:*';
        
        try {
            const config = this._getNamespaceConfig(namespace);
            
            if (config.useRedis && this.isRedisConnected && this.redis) {
                let cursor = '0';
                do {
                    const result = await this.redis.scan(cursor, 'MATCH', `${namespace}:${pattern}`, 'COUNT', 100);
                    cursor = result[0];
                    const keys = result[1];
                    
                    for (const key of keys) {
                        // Extract guildId from key: music:preserved:guildId
                        const match = key.match(/^music:preserved:(\d+)$/);
                        if (match) {
                            guildIds.push(match[1]);
                        }
                    }
                } while (cursor !== '0');
            } else {
                // Fallback to memory
                const memNs = this.memoryCache.get(namespace);
                if (memNs) {
                    for (const key of memNs.keys()) {
                        if (key.startsWith('preserved:')) {
                            const guildId = key.replace('preserved:', '');
                            guildIds.push(guildId);
                        }
                    }
                }
            }
        } catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `getAllPreservedQueueGuildIds error: ${(error as Error).message}`);
        }
        
        return guildIds;
    }

    /**
     * Set inactivity deadline for a guild
     * @param guildId - Guild ID
     * @param timeoutMs - Timeout in milliseconds
     */
    async setInactivityDeadline(guildId: string, timeoutMs: number): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        const ttlSeconds = Math.ceil(timeoutMs / 1000) + 60; // Add 60s buffer
        await this.set('music', `inactivity:${guildId}`, deadline, ttlSeconds);
    }

    /**
     * Get inactivity deadline for a guild
     * @param guildId - Guild ID
     * @returns Deadline timestamp or null
     */
    async getInactivityDeadline(guildId: string): Promise<number | null> {
        return this.peek<number>('music', `inactivity:${guildId}`);
    }

    /**
     * Clear inactivity deadline for a guild
     * @param guildId - Guild ID
     */
    async clearInactivityDeadline(guildId: string): Promise<void> {
        await this.delete('music', `inactivity:${guildId}`);
    }

    /**
     * Check all inactivity deadlines and return guilds past their deadline
     * @returns Array of guild IDs that have exceeded their inactivity deadline
     */
    async checkInactivityDeadlines(): Promise<string[]> {
        const expiredGuildIds: string[] = [];
        const now = Date.now();
        const namespace = 'music';
        const pattern = 'inactivity:*';
        
        try {
            const config = this._getNamespaceConfig(namespace);
            
            if (config.useRedis && this.isRedisConnected && this.redis) {
                let cursor = '0';
                do {
                    const result = await this.redis.scan(cursor, 'MATCH', `${namespace}:${pattern}`, 'COUNT', 100);
                    cursor = result[0];
                    const keys = result[1];
                    
                    for (const key of keys) {
                        const deadline = await this.redis.get(key);
                        if (deadline && parseInt(deadline, 10) <= now) {
                            const match = key.match(/^music:inactivity:(\d+)$/);
                            if (match) {
                                expiredGuildIds.push(match[1]);
                                // Auto-delete expired key
                                await this.redis.del(key);
                            }
                        }
                    }
                } while (cursor !== '0');
            } else {
                // Fallback to memory
                const memNs = this.memoryCache.get(namespace);
                if (memNs) {
                    for (const [key, entry] of memNs.entries()) {
                        if (key.startsWith('inactivity:') && typeof entry.value === 'number') {
                            if (entry.value <= now) {
                                const guildId = key.replace('inactivity:', '');
                                expiredGuildIds.push(guildId);
                                memNs.delete(key);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `checkInactivityDeadlines error: ${(error as Error).message}`);
        }
        
        return expiredGuildIds;
    }

    /**
     * Set VC monitor active flag for a guild
     * @param guildId - Guild ID
     * @param active - Whether monitor is active
     */
    async setVCMonitorActive(guildId: string, active: boolean): Promise<void> {
        if (active) {
            await this.set('music', `vcmonitor:${guildId}`, true, 3600); // 1h TTL
        } else {
            await this.delete('music', `vcmonitor:${guildId}`);
        }
    }

    /**
     * Check if VC monitor is active for a guild
     * @param guildId - Guild ID
     */
    async isVCMonitorActive(guildId: string): Promise<boolean> {
        const active = await this.peek<boolean>('music', `vcmonitor:${guildId}`);
        return active === true;
    }

    /**
     * Helper: Get or create memory namespace
     */
    private _getOrCreateMemoryNamespace(namespace: string): Map<string, MemoryCacheEntry> {
        if (!this.memoryCache.has(namespace)) {
            this.memoryCache.set(namespace, new Map());
        }
        return this.memoryCache.get(namespace)!;
    }

    /**
     * Get the Redis client instance (for advanced operations)
     * @returns Redis client or null if not connected
     */
    getRedis(): Redis | null {
        return this.isRedisConnected ? this.redis : null;
    }

    /**
     * Check if Redis is connected
     * @returns True if Redis is connected
     */
    isRedisAvailable(): boolean {
        return this.isRedisConnected && this.redis !== null;
    }

    /**
     * Shutdown cache service
     */
    async shutdown(): Promise<void> {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
        }
        this.memoryCache.clear();
        logger.info('CacheService', 'Shutdown complete');
    }
}
// SINGLETON EXPORT
/**
 * Singleton cache service instance
 */
const cacheService = new CacheService();

// Default export
export default cacheService;
