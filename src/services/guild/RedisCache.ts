/**
 * Redis Cache Service
 * High-performance caching for scale (1000+ servers)
 *
 * The in-memory fallback uses expiry timestamps checked by a periodic
 * sweep instead of per-key setTimeout calls, preventing timer accumulation
 * under high churn.
 *
 * @internal Used by CacheService — prefer CacheService for new code
 * @module services/guild/RedisCache
 */

import Redis from 'ioredis';
import logger from '../../core/Logger.js';

// TYPES
interface CacheTTL {
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

interface FallbackEntry {
    value: unknown;
    expiresAt: number;
}

interface SpamTracker {
    count: number;
    start: number;
}

interface DuplicateTracker {
    hash: string;
    count: number;
    start: number;
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetIn: number;
}

interface DuplicateResult {
    count: number;
    isNew: boolean;
}

interface CacheStats {
    connected: boolean;
    fallbackSize: number;
    redisInfo: string | null;
}

// REDIS CACHE CLASS
export class RedisCache {
    private _client: Redis | null = null;
    private _isConnected: boolean = false;

    /**
     * In-memory fallback with timestamp-based expiry.
     * A periodic sweep removes expired entries — no per-key timers.
     */
    private fallbackCache: Map<string, FallbackEntry> = new Map();
    private _sweepInterval: ReturnType<typeof setInterval> | null = null;

    /** Max fallback entries before LRU eviction */
    private readonly MAX_FALLBACK_SIZE = 10_000;

    /** Get connection status */
    get isConnected(): boolean {
        return this._isConnected;
    }

    /** Get Redis client for CacheService */
    get client(): Redis | null {
        return this._client;
    }

    public readonly TTL: CacheTTL = {
        GUILD_SETTINGS: 300,      // 5 minutes
        USER_PREFERENCES: 600,    // 10 minutes
        COOLDOWN: 60,             // 1 minute
        API_RESPONSE: 300,        // 5 minutes
        MUSIC_QUEUE: 3600,        // 1 hour
        SPAM_WINDOW: 10,          // 10 seconds
        DUPLICATE_WINDOW: 60,     // 60 seconds
        RATE_LIMIT: 60,           // 1 minute
        AUTOMOD_WARN: 3600,       // 1 hour
    };

    // ── Fallback helpers (no setTimeout) ─────────────────────────────

    /** Get a value from the fallback cache, returning null if expired. */
    private _fbGet(key: string): unknown | null {
        const entry = this.fallbackCache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.fallbackCache.delete(key);
            return null;
        }
        return entry.value;
    }

    /** Set a value in the fallback cache with a TTL (seconds). */
    private _fbSet(key: string, value: unknown, ttlSeconds: number): void {
        // Evict oldest if at capacity
        if (this.fallbackCache.size >= this.MAX_FALLBACK_SIZE) {
            const firstKey = this.fallbackCache.keys().next().value;
            if (firstKey !== undefined) this.fallbackCache.delete(firstKey);
        }
        this.fallbackCache.set(key, {
            value,
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
    }

    /** Delete a key from the fallback cache. */
    private _fbDelete(key: string): void {
        this.fallbackCache.delete(key);
    }

    /** Periodic sweep — remove all expired entries. */
    private _sweep(): void {
        const now = Date.now();
        for (const [key, entry] of this.fallbackCache) {
            if (now > entry.expiresAt) {
                this.fallbackCache.delete(key);
            }
        }
    }

    /** Start the periodic sweep interval. */
    private _startSweep(): void {
        if (this._sweepInterval) return;
        this._sweepInterval = setInterval(() => this._sweep(), 30_000); // every 30s
        if (this._sweepInterval.unref) this._sweepInterval.unref();
    }

    // ── Initialize ───────────────────────────────────────────────────

    /**
     * Initialize Redis connection
     */
    async initialize(): Promise<boolean> {
        // Start fallback sweep regardless of Redis availability
        this._startSweep();

        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        try {
            this._client = new Redis(redisUrl, {
                maxRetriesPerRequest: 1,
                retryStrategy: (times: number) => {
                    if (times > 3) return null;
                    return Math.min(times * 100, 1000);
                },
                enableReadyCheck: true,
                lazyConnect: true,
                connectTimeout: 5000,
            });

            this._client.on('connect', () => {
                logger.info('Redis', 'Connected');
                this._isConnected = true;
            });

            this._client.on('error', (err: Error) => {
                if (this._isConnected) {
                    logger.warn('Redis', `Error: ${err.message}`);
                }
                this._isConnected = false;
            });

            this._client.on('close', () => {
                this._isConnected = false;
            });

            await this._client.connect();
            return true;
        } catch {
            logger.info('Redis', 'Using in-memory cache (Redis not available)');
            this._isConnected = false;
            return false;
        }
    }

    // ── Core CRUD ────────────────────────────────────────────────────

    /**
     * Get value from cache
     */
    async get<T = unknown>(key: string): Promise<T | null> {
        try {
            if (this._isConnected && this._client) {
                const value = await this._client.get(key);
                return value ? JSON.parse(value) : null;
            }
            return (this._fbGet(key) as T) || null;
        } catch (error) {
            logger.error('Redis', `Get error: ${(error as Error).message}`);
            return (this._fbGet(key) as T) || null;
        }
    }

    /**
     * Set value in cache
     */
    async set(key: string, value: unknown, ttl: number = 300): Promise<void> {
        try {
            const stringValue = JSON.stringify(value);

            if (this._isConnected && this._client) {
                await this._client.setex(key, ttl, stringValue);
            }

            // Always set in fallback for redundancy
            this._fbSet(key, value, ttl);
        } catch (error) {
            logger.error('Redis', `Set error: ${(error as Error).message}`);
            this._fbSet(key, value, ttl);
        }
    }

    /**
     * Delete value from cache
     */
    async delete(key: string): Promise<void> {
        try {
            if (this._isConnected && this._client) {
                await this._client.del(key);
            }
            this._fbDelete(key);
        } catch (error) {
            logger.error('Redis', `Delete error: ${(error as Error).message}`);
        }
    }

    /**
     * Delete multiple keys by pattern
     */
    async deletePattern(pattern: string): Promise<void> {
        try {
            if (this._isConnected && this._client) {
                const keys = await this._client.keys(pattern);
                if (keys.length > 0) {
                    await this._client.del(...keys);
                }
            }

            // Clean fallback cache
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            for (const key of this.fallbackCache.keys()) {
                if (regex.test(key)) {
                    this.fallbackCache.delete(key);
                }
            }
        } catch (error) {
            logger.error('Redis', `DeletePattern error: ${(error as Error).message}`);
        }
    }

    // ── Guild Settings Cache ─────────────────────────────────────────

    async getGuildSettings<T = unknown>(guildId: string): Promise<T | null> {
        return this.get<T>(`guild:${guildId}:settings`);
    }

    async setGuildSettings(guildId: string, settings: unknown): Promise<void> {
        await this.set(`guild:${guildId}:settings`, settings, this.TTL.GUILD_SETTINGS);
    }

    async invalidateGuildSettings(guildId: string): Promise<void> {
        await this.delete(`guild:${guildId}:settings`);
    }

    // ── Cooldown Cache ───────────────────────────────────────────────

    async getCooldown(commandName: string, userId: string): Promise<number | null> {
        const key = `cooldown:${commandName}:${userId}`;
        const ttl = this._isConnected && this._client
            ? await this._client.ttl(key)
            : null;

        if (ttl && ttl > 0) {
            return ttl * 1000; // Convert to ms
        }
        return null;
    }

    async setCooldown(commandName: string, userId: string, cooldownMs: number): Promise<void> {
        const key = `cooldown:${commandName}:${userId}`;
        const ttlSeconds = Math.ceil(cooldownMs / 1000);
        await this.set(key, Date.now(), ttlSeconds);
    }

    // ── API Response Cache ───────────────────────────────────────────

    async getApiCache<T = unknown>(service: string, query: string): Promise<T | null> {
        const key = `api:${service}:${Buffer.from(query).toString('base64')}`;
        return this.get<T>(key);
    }

    async setApiCache(service: string, query: string, response: unknown, ttl: number = this.TTL.API_RESPONSE): Promise<void> {
        const key = `api:${service}:${Buffer.from(query).toString('base64')}`;
        await this.set(key, response, ttl);
    }

    // ── Statistics ───────────────────────────────────────────────────

    async increment(key: string): Promise<number> {
        try {
            if (this._isConnected && this._client) {
                return await this._client.incr(key);
            }
            const current = (this._fbGet(key) as number) || 0;
            this._fbSet(key, current + 1, 3600); // default 1h TTL for counters
            return current + 1;
        } catch (error) {
            logger.error('Redis', `Increment error: ${(error as Error).message}`);
            return 0;
        }
    }

    async getStats(): Promise<CacheStats> {
        return {
            connected: this._isConnected,
            fallbackSize: this.fallbackCache.size,
            redisInfo: this._isConnected && this._client ? await this._client.info('memory') : null,
        };
    }

    // ── Spam & Duplicate Tracking (AutoMod) ──────────────────────────

    async trackSpamMessage(guildId: string, userId: string, windowSeconds: number = 5): Promise<number> {
        const key = `spam:${guildId}:${userId}`;
        try {
            if (this._isConnected && this._client) {
                const multi = this._client.multi();
                multi.incr(key);
                multi.expire(key, windowSeconds);
                const results = await multi.exec();
                return results?.[0]?.[1] as number ?? 1;
            }
            // Fallback
            const now = Date.now();
            const windowMs = windowSeconds * 1000;
            let tracker = this._fbGet(key) as SpamTracker | null;
            if (!tracker || now - tracker.start > windowMs) {
                tracker = { count: 0, start: now };
            }
            tracker.count++;
            this._fbSet(key, tracker, windowSeconds);
            return tracker.count;
        } catch (error) {
            logger.error('Redis', `trackSpamMessage error: ${(error as Error).message}`);
            return 1;
        }
    }

    async resetSpamTracker(guildId: string, userId: string): Promise<void> {
        const key = `spam:${guildId}:${userId}`;
        await this.delete(key);
    }

    async trackDuplicateMessage(guildId: string, userId: string, content: string, windowSeconds: number = 30): Promise<DuplicateResult> {
        const contentHash = Buffer.from(content.toLowerCase().trim()).toString('base64').slice(0, 32);
        const countKey = `dup:${guildId}:${userId}:count`;
        const hashKey = `dup:${guildId}:${userId}:hash`;

        try {
            if (this._isConnected && this._client) {
                const storedHash = await this._client.get(hashKey);

                if (storedHash !== contentHash) {
                    const multi = this._client.multi();
                    multi.set(hashKey, contentHash, 'EX', windowSeconds);
                    multi.set(countKey, 1, 'EX', windowSeconds);
                    await multi.exec();
                    return { count: 1, isNew: true };
                }

                const multi = this._client.multi();
                multi.incr(countKey);
                multi.expire(countKey, windowSeconds);
                multi.expire(hashKey, windowSeconds);
                const results = await multi.exec();
                return { count: results?.[0]?.[1] as number ?? 1, isNew: false };
            }

            // Fallback
            const cacheKey = `dup:${guildId}:${userId}`;
            const now = Date.now();
            const windowMs = windowSeconds * 1000;
            let tracker = this._fbGet(cacheKey) as DuplicateTracker | null;

            if (!tracker || now - tracker.start > windowMs || tracker.hash !== contentHash) {
                tracker = { hash: contentHash, count: 1, start: now };
                this._fbSet(cacheKey, tracker, windowSeconds);
                return { count: 1, isNew: true };
            }

            tracker.count++;
            this._fbSet(cacheKey, tracker, windowSeconds);
            return { count: tracker.count, isNew: false };
        } catch (error) {
            logger.error('Redis', `trackDuplicateMessage error: ${(error as Error).message}`);
            return { count: 1, isNew: true };
        }
    }

    async resetDuplicateTracker(guildId: string, userId: string): Promise<void> {
        await this.delete(`dup:${guildId}:${userId}:count`);
        await this.delete(`dup:${guildId}:${userId}:hash`);
        this._fbDelete(`dup:${guildId}:${userId}`);
    }

    async trackAutomodWarn(guildId: string, userId: string, resetHours: number = 1): Promise<number> {
        const key = `automod:warn:${guildId}:${userId}`;
        const ttlSeconds = resetHours * 3600;

        try {
            if (this._isConnected && this._client) {
                const multi = this._client.multi();
                multi.incr(key);
                multi.expire(key, ttlSeconds);
                const results = await multi.exec();
                return results?.[0]?.[1] as number ?? 1;
            }
            // Fallback
            const current = ((this._fbGet(key) as number) || 0) + 1;
            this._fbSet(key, current, ttlSeconds);
            return current;
        } catch (error) {
            logger.error('Redis', `trackAutomodWarn error: ${(error as Error).message}`);
            return 1;
        }
    }

    async getAutomodWarnCount(guildId: string, userId: string): Promise<number> {
        const key = `automod:warn:${guildId}:${userId}`;
        try {
            if (this._isConnected && this._client) {
                const count = await this._client.get(key);
                return parseInt(count || '0') || 0;
            }
            return (this._fbGet(key) as number) || 0;
        } catch {
            return 0;
        }
    }

    async resetAutomodWarn(guildId: string, userId: string): Promise<void> {
        await this.delete(`automod:warn:${guildId}:${userId}`);
    }

    // ── Rate Limiting ────────────────────────────────────────────────

    async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
        const redisKey = `ratelimit:${key}`;

        try {
            if (this._isConnected && this._client) {
                const multi = this._client.multi();
                multi.incr(redisKey);
                multi.ttl(redisKey);
                const results = await multi.exec();

                const count = results?.[0]?.[1] as number ?? 0;
                let ttl = results?.[1]?.[1] as number ?? -1;

                if (ttl === -1) {
                    await this._client.expire(redisKey, windowSeconds);
                    ttl = windowSeconds;
                }

                const allowed = count <= limit;
                return {
                    allowed,
                    remaining: Math.max(0, limit - count),
                    resetIn: ttl * 1000,
                };
            }

            // Fallback
            const now = Date.now();
            const windowMs = windowSeconds * 1000;
            let tracker = this._fbGet(redisKey) as SpamTracker | null;

            if (!tracker || now - tracker.start > windowMs) {
                tracker = { count: 0, start: now };
            }

            tracker.count++;
            this._fbSet(redisKey, tracker, windowSeconds);
            const allowed = tracker.count <= limit;
            return {
                allowed,
                remaining: Math.max(0, limit - tracker.count),
                resetIn: windowMs - (now - tracker.start),
            };
        } catch (error) {
            logger.error('Redis', `checkRateLimit error: ${(error as Error).message}`);
            return { allowed: true, remaining: limit, resetIn: 0 };
        }
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        if (this._sweepInterval) {
            clearInterval(this._sweepInterval);
            this._sweepInterval = null;
        }
        if (this._client) {
            await this._client.quit();
            this._isConnected = false;
            logger.info('Redis', 'Disconnected');
        }
    }
}

// Create default instance
const redisCache = new RedisCache();

export default redisCache;
