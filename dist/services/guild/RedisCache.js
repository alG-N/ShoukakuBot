"use strict";
/**
 * Redis Cache Service
 * High-performance caching for scale (1000+ servers)
 * @internal Used by CacheService - prefer CacheService for new code
 * @module services/guild/RedisCache
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisCache = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
// REDIS CACHE CLASS
class RedisCache {
    _client = null;
    _isConnected = false;
    fallbackCache = new Map();
    /** Get connection status */
    get isConnected() {
        return this._isConnected;
    }
    /** Get Redis client for CacheService */
    get client() {
        return this._client;
    }
    TTL = {
        GUILD_SETTINGS: 300, // 5 minutes
        USER_PREFERENCES: 600, // 10 minutes
        COOLDOWN: 60, // 1 minute
        API_RESPONSE: 300, // 5 minutes
        MUSIC_QUEUE: 3600, // 1 hour
        SPAM_WINDOW: 10, // 10 seconds
        DUPLICATE_WINDOW: 60, // 60 seconds
        RATE_LIMIT: 60, // 1 minute
        AUTOMOD_WARN: 3600, // 1 hour
    };
    /**
     * Initialize Redis connection
     */
    async initialize() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        try {
            this._client = new ioredis_1.default(redisUrl, {
                maxRetriesPerRequest: 1,
                retryStrategy: (times) => {
                    if (times > 3)
                        return null;
                    return Math.min(times * 100, 1000);
                },
                enableReadyCheck: true,
                lazyConnect: true,
                connectTimeout: 5000,
            });
            this._client.on('connect', () => {
                console.log('[Redis] ✅ Connected');
                this._isConnected = true;
            });
            this._client.on('error', (err) => {
                if (this._isConnected) {
                    console.warn('[Redis] ⚠️ Error:', err.message);
                }
                this._isConnected = false;
            });
            this._client.on('close', () => {
                this._isConnected = false;
            });
            await this._client.connect();
            return true;
        }
        catch {
            console.log('[Redis] Using in-memory cache (Redis not available)');
            this._isConnected = false;
            return false;
        }
    }
    /**
     * Get value from cache
     */
    async get(key) {
        try {
            if (this._isConnected && this._client) {
                const value = await this._client.get(key);
                return value ? JSON.parse(value) : null;
            }
            return this.fallbackCache.get(key) || null;
        }
        catch (error) {
            console.error('[Redis] Get error:', error.message);
            return this.fallbackCache.get(key) || null;
        }
    }
    /**
     * Set value in cache
     */
    async set(key, value, ttl = 300) {
        try {
            const stringValue = JSON.stringify(value);
            if (this._isConnected && this._client) {
                await this._client.setex(key, ttl, stringValue);
            }
            // Always set in fallback for redundancy
            this.fallbackCache.set(key, value);
            setTimeout(() => this.fallbackCache.delete(key), ttl * 1000);
        }
        catch (error) {
            console.error('[Redis] Set error:', error.message);
            this.fallbackCache.set(key, value);
        }
    }
    /**
     * Delete value from cache
     */
    async delete(key) {
        try {
            if (this._isConnected && this._client) {
                await this._client.del(key);
            }
            this.fallbackCache.delete(key);
        }
        catch (error) {
            console.error('[Redis] Delete error:', error.message);
        }
    }
    /**
     * Delete multiple keys by pattern
     */
    async deletePattern(pattern) {
        try {
            if (this._isConnected && this._client) {
                const keys = await this._client.keys(pattern);
                if (keys.length > 0) {
                    await this._client.del(...keys);
                }
            }
            // Clean fallback cache
            for (const key of this.fallbackCache.keys()) {
                if (key.match(new RegExp(pattern.replace('*', '.*')))) {
                    this.fallbackCache.delete(key);
                }
            }
        }
        catch (error) {
            console.error('[Redis] DeletePattern error:', error.message);
        }
    }
    // Guild Settings Cache
    async getGuildSettings(guildId) {
        return this.get(`guild:${guildId}:settings`);
    }
    async setGuildSettings(guildId, settings) {
        await this.set(`guild:${guildId}:settings`, settings, this.TTL.GUILD_SETTINGS);
    }
    async invalidateGuildSettings(guildId) {
        await this.delete(`guild:${guildId}:settings`);
    }
    // Cooldown Cache
    async getCooldown(commandName, userId) {
        const key = `cooldown:${commandName}:${userId}`;
        const ttl = this._isConnected && this._client
            ? await this._client.ttl(key)
            : null;
        if (ttl && ttl > 0) {
            return ttl * 1000; // Convert to ms
        }
        return null;
    }
    async setCooldown(commandName, userId, cooldownMs) {
        const key = `cooldown:${commandName}:${userId}`;
        const ttlSeconds = Math.ceil(cooldownMs / 1000);
        await this.set(key, Date.now(), ttlSeconds);
    }
    // API Response Cache
    async getApiCache(service, query) {
        const key = `api:${service}:${Buffer.from(query).toString('base64')}`;
        return this.get(key);
    }
    async setApiCache(service, query, response, ttl = this.TTL.API_RESPONSE) {
        const key = `api:${service}:${Buffer.from(query).toString('base64')}`;
        await this.set(key, response, ttl);
    }
    // Statistics
    async increment(key) {
        try {
            if (this._isConnected && this._client) {
                return await this._client.incr(key);
            }
            const current = this.fallbackCache.get(key) || 0;
            this.fallbackCache.set(key, current + 1);
            return current + 1;
        }
        catch (error) {
            console.error('[Redis] Increment error:', error.message);
            return 0;
        }
    }
    async getStats() {
        return {
            connected: this._isConnected,
            fallbackSize: this.fallbackCache.size,
            redisInfo: this._isConnected && this._client ? await this._client.info('memory') : null,
        };
    }
    // Spam & Duplicate Tracking (AutoMod)
    async trackSpamMessage(guildId, userId, windowSeconds = 5) {
        const key = `spam:${guildId}:${userId}`;
        try {
            if (this._isConnected && this._client) {
                const multi = this._client.multi();
                multi.incr(key);
                multi.expire(key, windowSeconds);
                const results = await multi.exec();
                return results?.[0]?.[1] ?? 1;
            }
            // Fallback to in-memory
            const now = Date.now();
            const windowMs = windowSeconds * 1000;
            let tracker = this.fallbackCache.get(key);
            if (!tracker || now - tracker.start > windowMs) {
                tracker = { count: 0, start: now };
            }
            tracker.count++;
            this.fallbackCache.set(key, tracker);
            setTimeout(() => this.fallbackCache.delete(key), windowMs);
            return tracker.count;
        }
        catch (error) {
            console.error('[Redis] trackSpamMessage error:', error.message);
            return 1;
        }
    }
    async resetSpamTracker(guildId, userId) {
        const key = `spam:${guildId}:${userId}`;
        await this.delete(key);
    }
    async trackDuplicateMessage(guildId, userId, content, windowSeconds = 30) {
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
                return { count: results?.[0]?.[1] ?? 1, isNew: false };
            }
            // Fallback
            const cacheKey = `dup:${guildId}:${userId}`;
            const now = Date.now();
            const windowMs = windowSeconds * 1000;
            let tracker = this.fallbackCache.get(cacheKey);
            if (!tracker || now - tracker.start > windowMs || tracker.hash !== contentHash) {
                tracker = { hash: contentHash, count: 1, start: now };
                this.fallbackCache.set(cacheKey, tracker);
                setTimeout(() => this.fallbackCache.delete(cacheKey), windowMs);
                return { count: 1, isNew: true };
            }
            tracker.count++;
            return { count: tracker.count, isNew: false };
        }
        catch (error) {
            console.error('[Redis] trackDuplicateMessage error:', error.message);
            return { count: 1, isNew: true };
        }
    }
    async resetDuplicateTracker(guildId, userId) {
        await this.delete(`dup:${guildId}:${userId}:count`);
        await this.delete(`dup:${guildId}:${userId}:hash`);
        this.fallbackCache.delete(`dup:${guildId}:${userId}`);
    }
    async trackAutomodWarn(guildId, userId, resetHours = 1) {
        const key = `automod:warn:${guildId}:${userId}`;
        const ttlSeconds = resetHours * 3600;
        try {
            if (this._isConnected && this._client) {
                const multi = this._client.multi();
                multi.incr(key);
                multi.expire(key, ttlSeconds);
                const results = await multi.exec();
                return results?.[0]?.[1] ?? 1;
            }
            // Fallback
            const current = (this.fallbackCache.get(key) || 0) + 1;
            this.fallbackCache.set(key, current);
            setTimeout(() => this.fallbackCache.delete(key), ttlSeconds * 1000);
            return current;
        }
        catch (error) {
            console.error('[Redis] trackAutomodWarn error:', error.message);
            return 1;
        }
    }
    async getAutomodWarnCount(guildId, userId) {
        const key = `automod:warn:${guildId}:${userId}`;
        try {
            if (this._isConnected && this._client) {
                const count = await this._client.get(key);
                return parseInt(count || '0') || 0;
            }
            return this.fallbackCache.get(key) || 0;
        }
        catch {
            return 0;
        }
    }
    async resetAutomodWarn(guildId, userId) {
        await this.delete(`automod:warn:${guildId}:${userId}`);
    }
    // Rate Limiting
    async checkRateLimit(key, limit, windowSeconds) {
        const redisKey = `ratelimit:${key}`;
        try {
            if (this._isConnected && this._client) {
                const multi = this._client.multi();
                multi.incr(redisKey);
                multi.ttl(redisKey);
                const results = await multi.exec();
                const count = results?.[0]?.[1] ?? 0;
                let ttl = results?.[1]?.[1] ?? -1;
                if (ttl === -1) {
                    await this._client.expire(redisKey, windowSeconds);
                    ttl = windowSeconds;
                }
                const allowed = count <= limit;
                return {
                    allowed,
                    remaining: Math.max(0, limit - count),
                    resetIn: ttl * 1000
                };
            }
            // Fallback
            const now = Date.now();
            const windowMs = windowSeconds * 1000;
            let tracker = this.fallbackCache.get(redisKey);
            if (!tracker || now - tracker.start > windowMs) {
                tracker = { count: 0, start: now };
                this.fallbackCache.set(redisKey, tracker);
                setTimeout(() => this.fallbackCache.delete(redisKey), windowMs);
            }
            tracker.count++;
            const allowed = tracker.count <= limit;
            return {
                allowed,
                remaining: Math.max(0, limit - tracker.count),
                resetIn: windowMs - (now - tracker.start)
            };
        }
        catch (error) {
            console.error('[Redis] checkRateLimit error:', error.message);
            return { allowed: true, remaining: limit, resetIn: 0 };
        }
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
        if (this._client) {
            await this._client.quit();
            this._isConnected = false;
            console.log('[Redis] Disconnected');
        }
    }
}
exports.RedisCache = RedisCache;
// Create default instance
const redisCache = new RedisCache();
exports.default = redisCache;
//# sourceMappingURL=RedisCache.js.map