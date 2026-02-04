"use strict";
/**
 * Unified Cache Service
 * Single interface for all caching needs
 * Supports Redis (distributed) with in-memory fallback
 * Integrates with GracefulDegradation for automatic failover
 * @module cache/CacheService
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = exports.DEFAULT_NAMESPACES = void 0;
const GracefulDegradation_js_1 = __importDefault(require("../core/GracefulDegradation.js"));
// Helper to get default export from require()
const getDefault = (mod) => mod.default || mod;
// Use require for internal modules to avoid circular dependency issues
const logger = getDefault(require('../core/Logger'));
// DEFAULT CONFIGURATION
/**
 * Default namespace configurations
 */
exports.DEFAULT_NAMESPACES = {
    'guild': { ttl: 300, maxSize: 1000, useRedis: true }, // Guild settings - 5min
    'user': { ttl: 600, maxSize: 2000, useRedis: true }, // User data - 10min
    'api': { ttl: 300, maxSize: 500, useRedis: true }, // API responses - 5min
    'music': { ttl: 3600, maxSize: 200, useRedis: true }, // Music queues - 1h
    'automod': { ttl: 60, maxSize: 5000, useRedis: true }, // AutoMod tracking - 1min
    'ratelimit': { ttl: 60, maxSize: 10000, useRedis: true }, // Rate limits - 1min
    'session': { ttl: 1800, maxSize: 500, useRedis: true }, // Sessions - 30min
    'temp': { ttl: 60, maxSize: 1000, useRedis: false }, // Temporary - 1min, memory only
};
/**
 * Default temp namespace config for fallback
 */
const DEFAULT_TEMP_CONFIG = { ttl: 60, maxSize: 1000, useRedis: false };
// CACHE SERVICE CLASS
/**
 * Unified cache service with Redis + memory fallback
 */
class CacheService {
    /** Redis client instance */
    redis = null;
    /** Whether Redis is currently connected */
    isRedisConnected = false;
    /** In-memory cache storage by namespace */
    memoryCache;
    /** Namespace configurations */
    namespaces;
    /** Performance metrics */
    metrics;
    /** Consecutive Redis failures */
    redisFailures = 0;
    /** Max failures before marking degraded */
    maxRedisFailures;
    /** Cleanup interval reference */
    _cleanupInterval;
    constructor(options = {}) {
        this.memoryCache = new Map();
        this.namespaces = new Map(Object.entries(exports.DEFAULT_NAMESPACES));
        this.maxRedisFailures = options.maxRedisFailures || 3;
        // Initialize metrics
        this.metrics = {
            hits: 0,
            misses: 0,
            writes: 0,
            deletes: 0,
            errors: 0,
            redisHits: 0,
            memoryHits: 0,
            redisFallbacks: 0,
        };
        // Cleanup interval for memory cache
        // Use .unref() to allow process to exit gracefully even if interval is running
        this._cleanupInterval = setInterval(() => this._cleanupMemory(), options.cleanupIntervalMs || 60000);
        this._cleanupInterval.unref();
    }
    /**
     * Initialize with Redis connection
     * @param redisClient - ioredis client instance
     */
    setRedis(redisClient) {
        this.redis = redisClient;
        this.isRedisConnected = !!redisClient;
        if (redisClient) {
            // Register with graceful degradation
            GracefulDegradation_js_1.default.initialize();
            GracefulDegradation_js_1.default.registerFallback('redis', async () => null); // Fallback returns null (cache miss)
            // Recover any pending write queue from previous session
            // Pass Redis client directly to avoid circular dependency timing issues
            GracefulDegradation_js_1.default.recoverWriteQueue(redisClient).catch((err) => {
                logger.error('CacheService', `Failed to recover write queue: ${err.message}`);
            });
            // Listen for Redis errors
            redisClient.on('error', (error) => {
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
    _handleRedisError(error) {
        this.redisFailures++;
        logger.error('CacheService', `Redis error (${this.redisFailures}/${this.maxRedisFailures}): ${error.message}`);
        if (this.redisFailures >= this.maxRedisFailures) {
            GracefulDegradation_js_1.default.markDegraded('redis', 'Too many failures');
            this.isRedisConnected = false;
        }
    }
    /**
     * Handle Redis reconnection
     */
    _handleRedisReconnect() {
        this.redisFailures = 0;
        this.isRedisConnected = true;
        GracefulDegradation_js_1.default.markHealthy('redis');
        logger.info('CacheService', 'Redis reconnected');
    }
    /**
     * Register a new namespace with custom config
     * @param namespace - Namespace name
     * @param config - Namespace configuration
     */
    registerNamespace(namespace, config) {
        this.namespaces.set(namespace, {
            ttl: config.ttl || 300,
            maxSize: config.maxSize || 1000,
            useRedis: config.useRedis !== false,
        });
    }
    /**
     * Build full cache key
     */
    _buildKey(namespace, key) {
        return `${namespace}:${key}`;
    }
    /**
     * Get namespace config
     */
    _getNamespaceConfig(namespace) {
        return this.namespaces.get(namespace) ?? DEFAULT_TEMP_CONFIG;
    }
    /**
     * Get value from cache
     * @param namespace - Cache namespace
     * @param key - Cache key
     * @returns Cached value or null
     */
    async get(namespace, key) {
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
                        // Reset failures on success
                        this.redisFailures = 0;
                        return JSON.parse(value);
                    }
                }
                catch (redisError) {
                    // Redis operation failed, mark and fallback
                    this._handleRedisError(redisError);
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
                    return entry.value;
                }
                // Clean up expired
                if (entry)
                    memNs.delete(key);
            }
            this.metrics.misses++;
            return null;
        }
        catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `Get error: ${error.message}`);
            return null;
        }
    }
    /**
     * Set value in cache
     * @param namespace - Cache namespace
     * @param key - Cache key
     * @param value - Value to cache
     * @param ttl - TTL in seconds (optional, uses namespace default)
     */
    async set(namespace, key, value, ttl) {
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
                }
                catch (redisError) {
                    // Redis write failed, mark and continue to memory
                    this._handleRedisError(redisError);
                    this.metrics.redisFallbacks++;
                }
            }
            // Always write to memory as fallback
            if (!this.memoryCache.has(namespace)) {
                this.memoryCache.set(namespace, new Map());
            }
            const memNs = this.memoryCache.get(namespace);
            // Evict if at capacity
            if (memNs.size >= config.maxSize) {
                this._evictLRU(namespace);
            }
            memNs.set(key, {
                value,
                expiresAt: Date.now() + (actualTtl * 1000)
            });
        }
        catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `Set error: ${error.message}`);
        }
    }
    /**
     * Delete value from cache
     * @param namespace - Cache namespace
     * @param key - Cache key
     */
    async delete(namespace, key) {
        const fullKey = this._buildKey(namespace, key);
        const config = this._getNamespaceConfig(namespace);
        try {
            this.metrics.deletes++;
            if (config.useRedis && this.isRedisConnected && this.redis) {
                try {
                    await this.redis.del(fullKey);
                    this.redisFailures = 0;
                }
                catch (redisError) {
                    this._handleRedisError(redisError);
                }
            }
            const memNs = this.memoryCache.get(namespace);
            if (memNs)
                memNs.delete(key);
        }
        catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `Delete error: ${error.message}`);
        }
    }
    /**
     * Check if key exists
     * @param namespace - Cache namespace
     * @param key - Cache key
     * @returns True if key exists
     */
    async has(namespace, key) {
        return (await this.get(namespace, key)) !== null;
    }
    /**
     * Get or set (cache-aside pattern)
     * @param namespace - Cache namespace
     * @param key - Cache key
     * @param factory - Async function to get value if not cached
     * @param ttl - TTL in seconds
     * @returns Cached or newly fetched value
     */
    async getOrSet(namespace, key, factory, ttl) {
        const cached = await this.get(namespace, key);
        if (cached !== null) {
            return cached;
        }
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
    async increment(namespace, key, ttl) {
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
                    return results[0][1];
                }
            }
            // Fallback to memory
            if (!this.memoryCache.has(namespace)) {
                this.memoryCache.set(namespace, new Map());
            }
            const memNs = this.memoryCache.get(namespace);
            const entry = memNs.get(key);
            const currentValue = typeof entry?.value === 'number' ? entry.value : 0;
            const newCount = currentValue + 1;
            memNs.set(key, {
                value: newCount,
                expiresAt: Date.now() + (actualTtl * 1000)
            });
            return newCount;
        }
        catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `Increment error: ${error.message}`);
            return 1;
        }
    }
    /**
     * Clear all keys in a namespace
     * @param namespace - Namespace to clear
     */
    async clearNamespace(namespace) {
        try {
            const config = this._getNamespaceConfig(namespace);
            if (config.useRedis && this.isRedisConnected && this.redis) {
                const keys = await this.redis.keys(`${namespace}:*`);
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                }
            }
            this.memoryCache.delete(namespace);
            logger.debug('CacheService', `Cleared namespace: ${namespace}`);
        }
        catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `Clear namespace error: ${error.message}`);
        }
    }
    /**
     * Get cache statistics
     * @returns Cache statistics with service state
     */
    getStats() {
        const memorySize = [...this.memoryCache.values()]
            .reduce((sum, ns) => sum + ns.size, 0);
        const redisState = GracefulDegradation_js_1.default.getServiceState('redis') || 'unknown';
        const totalRequests = this.metrics.hits + this.metrics.misses;
        return {
            ...this.metrics,
            hitRate: totalRequests > 0 ? this.metrics.hits / totalRequests : 0,
            redisConnected: this.isRedisConnected,
            redisState,
            redisFailures: this.redisFailures,
            memoryEntries: memorySize,
            namespaces: [...this.namespaces.keys()],
        };
    }
    /**
     * Evict least recently used entry from namespace
     */
    _evictLRU(namespace) {
        const memNs = this.memoryCache.get(namespace);
        if (!memNs || memNs.size === 0)
            return;
        // Simple: just delete the first (oldest) entry
        const firstKey = memNs.keys().next().value;
        if (firstKey) {
            memNs.delete(firstKey);
        }
    }
    /**
     * Cleanup expired entries from memory cache
     */
    _cleanupMemory() {
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
    async trackSpamMessage(guildId, userId, windowSeconds = 5) {
        const key = `spam:${guildId}:${userId}`;
        const namespace = 'automod';
        try {
            const config = this._getNamespaceConfig(namespace);
            if (config.useRedis && this.isRedisConnected && this.redis) {
                const multi = this.redis.multi();
                multi.incr(key);
                multi.expire(key, windowSeconds);
                const results = await multi.exec();
                return results?.[0]?.[1] ?? 1;
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
        }
        catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `trackSpamMessage error: ${error.message}`);
            return 1;
        }
    }
    /**
     * Reset spam tracker for a user
     */
    async resetSpamTracker(guildId, userId) {
        await this.delete('automod', `spam:${guildId}:${userId}`);
    }
    /**
     * Track duplicate messages for a user
     * @returns Object with count and whether it's a new message hash
     */
    async trackDuplicateMessage(guildId, userId, content, windowSeconds = 30) {
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
                return { count: results?.[0]?.[1] ?? 1, isNew: false };
            }
            // Fallback to memory
            const memNs = this._getOrCreateMemoryNamespace(namespace);
            const now = Date.now();
            const windowMs = windowSeconds * 1000;
            const cacheKey = `dup:${guildId}:${userId}`;
            const entry = memNs.get(cacheKey);
            const tracker = entry?.value;
            if (!tracker || now >= entry.expiresAt || tracker.hash !== contentHash) {
                memNs.set(cacheKey, { value: { hash: contentHash, count: 1 }, expiresAt: now + windowMs });
                return { count: 1, isNew: true };
            }
            tracker.count++;
            return { count: tracker.count, isNew: false };
        }
        catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `trackDuplicateMessage error: ${error.message}`);
            return { count: 1, isNew: true };
        }
    }
    /**
     * Reset duplicate tracker for a user
     */
    async resetDuplicateTracker(guildId, userId) {
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
    async trackAutomodWarn(guildId, userId, resetHours = 1) {
        const key = `warn:${guildId}:${userId}`;
        const ttlSeconds = resetHours * 3600;
        return this.increment('automod', key, ttlSeconds);
    }
    /**
     * Get automod warning count for a user
     */
    async getAutomodWarnCount(guildId, userId) {
        const value = await this.get('automod', `warn:${guildId}:${userId}`);
        return value ?? 0;
    }
    /**
     * Reset automod warnings for a user
     */
    async resetAutomodWarn(guildId, userId) {
        await this.delete('automod', `warn:${guildId}:${userId}`);
    }
    /**
     * Check rate limit for a key
     * @param key - Rate limit key
     * @param limit - Max requests allowed
     * @param windowSeconds - Time window in seconds
     * @returns Rate limit result with allowed status and remaining
     */
    async checkRateLimit(key, limit, windowSeconds) {
        const fullKey = `ratelimit:${key}`;
        const namespace = 'ratelimit';
        try {
            const config = this._getNamespaceConfig(namespace);
            if (config.useRedis && this.isRedisConnected && this.redis) {
                const multi = this.redis.multi();
                multi.incr(fullKey);
                multi.ttl(fullKey);
                const results = await multi.exec();
                const count = results?.[0]?.[1] ?? 0;
                let ttl = results?.[1]?.[1] ?? -1;
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
            const count = entry.value + 1;
            memNs.set(key, { value: count, expiresAt: entry.expiresAt });
            const allowed = count <= limit;
            return {
                allowed,
                remaining: Math.max(0, limit - count),
                resetIn: entry.expiresAt - now
            };
        }
        catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `checkRateLimit error: ${error.message}`);
            return { allowed: true, remaining: limit, resetIn: 0 };
        }
    }
    /**
     * Get guild settings from cache
     * @param guildId - Guild ID
     * @returns Cached settings or null
     */
    async getGuildSettings(guildId) {
        return this.get('guild', `${guildId}:settings`);
    }
    /**
     * Set guild settings in cache
     * @param guildId - Guild ID
     * @param settings - Settings object
     * @param ttl - TTL in seconds (default 300)
     */
    async setGuildSettings(guildId, settings, ttl = 300) {
        await this.set('guild', `${guildId}:settings`, settings, ttl);
    }
    /**
     * Invalidate guild settings cache
     * @param guildId - Guild ID
     */
    async invalidateGuildSettings(guildId) {
        await this.delete('guild', `${guildId}:settings`);
    }
    /**
     * Get cooldown remaining for a command
     * @param commandName - Command name
     * @param userId - User ID
     * @returns Remaining cooldown in milliseconds or null
     */
    async getCooldown(commandName, userId) {
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
        }
        catch (error) {
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
    async setCooldown(commandName, userId, cooldownMs) {
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
    async checkAndSetCooldown(commandName, userId, cooldownMs) {
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
        }
        catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `checkAndSetCooldown error: ${error.message}`);
            return { passed: true, remaining: 0 };
        }
    }
    /**
     * Clear cooldown for a user and command
     * @param commandName - Command name
     * @param userId - User ID
     */
    async clearCooldown(commandName, userId) {
        await this.delete('ratelimit', `cooldown:${commandName}:${userId}`);
    }
    /**
     * Clear all cooldowns for a user
     * @param userId - User ID
     */
    async clearUserCooldowns(userId) {
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
        }
        catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `clearUserCooldowns error: ${error.message}`);
        }
    }
    /**
     * Cache API response
     * @param service - Service name
     * @param query - Query string
     * @param response - Response data
     * @param ttl - TTL in seconds (default 300)
     */
    async setApiCache(service, query, response, ttl = 300) {
        const key = `${service}:${Buffer.from(query).toString('base64').slice(0, 64)}`;
        await this.set('api', key, response, ttl);
    }
    /**
     * Get cached API response
     * @param service - Service name
     * @param query - Query string
     * @returns Cached response or null
     */
    async getApiCache(service, query) {
        const key = `${service}:${Buffer.from(query).toString('base64').slice(0, 64)}`;
        return this.get('api', key);
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
    async preserveQueueState(guildId, state, ttlSeconds = 1800) {
        await this.set('music', `preserved:${guildId}`, state, ttlSeconds);
    }
    /**
     * Get preserved queue state for a guild
     * @param guildId - Guild ID
     * @returns Preserved state or null
     */
    async getPreservedQueueState(guildId) {
        return this.get('music', `preserved:${guildId}`);
    }
    /**
     * Clear preserved queue state for a guild
     * @param guildId - Guild ID
     */
    async clearPreservedQueueState(guildId) {
        await this.delete('music', `preserved:${guildId}`);
    }
    /**
     * Get all preserved queue guild IDs
     * Uses Redis SCAN for efficiency
     * @returns Array of guild IDs with preserved state
     */
    async getAllPreservedQueueGuildIds() {
        const guildIds = [];
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
            }
            else {
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
        }
        catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `getAllPreservedQueueGuildIds error: ${error.message}`);
        }
        return guildIds;
    }
    /**
     * Set inactivity deadline for a guild
     * @param guildId - Guild ID
     * @param timeoutMs - Timeout in milliseconds
     */
    async setInactivityDeadline(guildId, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        const ttlSeconds = Math.ceil(timeoutMs / 1000) + 60; // Add 60s buffer
        await this.set('music', `inactivity:${guildId}`, deadline, ttlSeconds);
    }
    /**
     * Get inactivity deadline for a guild
     * @param guildId - Guild ID
     * @returns Deadline timestamp or null
     */
    async getInactivityDeadline(guildId) {
        return this.get('music', `inactivity:${guildId}`);
    }
    /**
     * Clear inactivity deadline for a guild
     * @param guildId - Guild ID
     */
    async clearInactivityDeadline(guildId) {
        await this.delete('music', `inactivity:${guildId}`);
    }
    /**
     * Check all inactivity deadlines and return guilds past their deadline
     * @returns Array of guild IDs that have exceeded their inactivity deadline
     */
    async checkInactivityDeadlines() {
        const expiredGuildIds = [];
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
            }
            else {
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
        }
        catch (error) {
            this.metrics.errors++;
            logger.error('CacheService', `checkInactivityDeadlines error: ${error.message}`);
        }
        return expiredGuildIds;
    }
    /**
     * Set VC monitor active flag for a guild
     * @param guildId - Guild ID
     * @param active - Whether monitor is active
     */
    async setVCMonitorActive(guildId, active) {
        if (active) {
            await this.set('music', `vcmonitor:${guildId}`, true, 3600); // 1h TTL
        }
        else {
            await this.delete('music', `vcmonitor:${guildId}`);
        }
    }
    /**
     * Check if VC monitor is active for a guild
     * @param guildId - Guild ID
     */
    async isVCMonitorActive(guildId) {
        const active = await this.get('music', `vcmonitor:${guildId}`);
        return active === true;
    }
    /**
     * Helper: Get or create memory namespace
     */
    _getOrCreateMemoryNamespace(namespace) {
        if (!this.memoryCache.has(namespace)) {
            this.memoryCache.set(namespace, new Map());
        }
        return this.memoryCache.get(namespace);
    }
    /**
     * Get the Redis client instance (for advanced operations)
     * @returns Redis client or null if not connected
     */
    getRedis() {
        return this.isRedisConnected ? this.redis : null;
    }
    /**
     * Check if Redis is connected
     * @returns True if Redis is connected
     */
    isRedisAvailable() {
        return this.isRedisConnected && this.redis !== null;
    }
    /**
     * Shutdown cache service
     */
    async shutdown() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
        }
        this.memoryCache.clear();
        logger.info('CacheService', 'Shutdown complete');
    }
}
exports.CacheService = CacheService;
// SINGLETON EXPORT
/**
 * Singleton cache service instance
 */
const cacheService = new CacheService();
// Default export
exports.default = cacheService;
// CommonJS COMPATIBILITY
module.exports = cacheService;
module.exports.CacheService = CacheService;
module.exports.DEFAULT_NAMESPACES = exports.DEFAULT_NAMESPACES;
module.exports.default = cacheService;
//# sourceMappingURL=CacheService.js.map