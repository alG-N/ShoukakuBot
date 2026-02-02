/**
 * Redis Cache Service
 * High-performance caching for scale (1000+ servers)
 * @module services/RedisCache
 */

const Redis = require('ioredis');

class RedisCache {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.fallbackCache = new Map(); // In-memory fallback
        
        // Cache TTLs (in seconds)
        this.TTL = {
            GUILD_SETTINGS: 300,      // 5 minutes
            USER_PREFERENCES: 600,    // 10 minutes
            COOLDOWN: 60,             // 1 minute
            API_RESPONSE: 300,        // 5 minutes
            MUSIC_QUEUE: 3600,        // 1 hour
            SPAM_WINDOW: 10,          // 10 seconds for spam tracking
            DUPLICATE_WINDOW: 60,     // 60 seconds for duplicate tracking
            RATE_LIMIT: 60,           // 1 minute for rate limits
            AUTOMOD_WARN: 3600,       // 1 hour for automod warn tracking
        };
    }

    /**
     * Initialize Redis connection
     */
    async initialize() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        
        try {
            this.client = new Redis(redisUrl, {
                maxRetriesPerRequest: 1,
                retryStrategy: (times) => {
                    if (times > 3) {
                        // Stop retrying after 3 attempts
                        return null;
                    }
                    return Math.min(times * 100, 1000);
                },
                enableReadyCheck: true,
                lazyConnect: true,
                connectTimeout: 5000,
            });

            this.client.on('connect', () => {
                console.log('[Redis] ✅ Connected');
                this.isConnected = true;
            });

            this.client.on('error', (err) => {
                if (this.isConnected) {
                    console.warn('[Redis] ⚠️ Error:', err.message);
                }
                this.isConnected = false;
            });

            this.client.on('close', () => {
                this.isConnected = false;
            });

            await this.client.connect();
            return true;
        } catch (error) {
            console.log('[Redis] Using in-memory cache (Redis not available)');
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Get value from cache
     * @param {string} key - Cache key
     * @returns {Promise<any>}
     */
    async get(key) {
        try {
            if (this.isConnected) {
                const value = await this.client.get(key);
                return value ? JSON.parse(value) : null;
            }
            return this.fallbackCache.get(key) || null;
        } catch (error) {
            console.error('[Redis] Get error:', error.message);
            return this.fallbackCache.get(key) || null;
        }
    }

    /**
     * Set value in cache
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - Time to live in seconds
     */
    async set(key, value, ttl = 300) {
        try {
            const stringValue = JSON.stringify(value);
            
            if (this.isConnected) {
                await this.client.setex(key, ttl, stringValue);
            }
            
            // Always set in fallback for redundancy
            this.fallbackCache.set(key, value);
            setTimeout(() => this.fallbackCache.delete(key), ttl * 1000);
        } catch (error) {
            console.error('[Redis] Set error:', error.message);
            this.fallbackCache.set(key, value);
        }
    }

    /**
     * Delete value from cache
     * @param {string} key - Cache key
     */
    async delete(key) {
        try {
            if (this.isConnected) {
                await this.client.del(key);
            }
            this.fallbackCache.delete(key);
        } catch (error) {
            console.error('[Redis] Delete error:', error.message);
        }
    }

    /**
     * Delete multiple keys by pattern
     * @param {string} pattern - Key pattern (e.g., 'guild:*')
     */
    async deletePattern(pattern) {
        try {
            if (this.isConnected) {
                const keys = await this.client.keys(pattern);
                if (keys.length > 0) {
                    await this.client.del(...keys);
                }
            }
            
            // Clean fallback cache
            for (const key of this.fallbackCache.keys()) {
                if (key.match(new RegExp(pattern.replace('*', '.*')))) {
                    this.fallbackCache.delete(key);
                }
            }
        } catch (error) {
            console.error('[Redis] DeletePattern error:', error.message);
        }
    }

    // ========================================
    // Guild Settings Cache
    // ========================================

    /**
     * Get guild settings from cache
     * @param {string} guildId - Guild ID
     */
    async getGuildSettings(guildId) {
        return this.get(`guild:${guildId}:settings`);
    }

    /**
     * Cache guild settings
     * @param {string} guildId - Guild ID
     * @param {Object} settings - Settings object
     */
    async setGuildSettings(guildId, settings) {
        await this.set(`guild:${guildId}:settings`, settings, this.TTL.GUILD_SETTINGS);
    }

    /**
     * Invalidate guild settings cache
     * @param {string} guildId - Guild ID
     */
    async invalidateGuildSettings(guildId) {
        await this.delete(`guild:${guildId}:settings`);
    }

    // ========================================
    // Cooldown Cache
    // ========================================

    /**
     * Check if user is on cooldown
     * @param {string} commandName - Command name
     * @param {string} userId - User ID
     * @returns {Promise<number|null>} Remaining cooldown in ms, or null if not on cooldown
     */
    async getCooldown(commandName, userId) {
        const key = `cooldown:${commandName}:${userId}`;
        const ttl = this.isConnected 
            ? await this.client.ttl(key)
            : null;
        
        if (ttl && ttl > 0) {
            return ttl * 1000; // Convert to ms
        }
        return null;
    }

    /**
     * Set cooldown for user
     * @param {string} commandName - Command name
     * @param {string} userId - User ID
     * @param {number} cooldownMs - Cooldown in milliseconds
     */
    async setCooldown(commandName, userId, cooldownMs) {
        const key = `cooldown:${commandName}:${userId}`;
        const ttlSeconds = Math.ceil(cooldownMs / 1000);
        await this.set(key, Date.now(), ttlSeconds);
    }

    // ========================================
    // API Response Cache
    // ========================================

    /**
     * Get cached API response
     * @param {string} service - Service name (e.g., 'anilist', 'reddit')
     * @param {string} query - Query string
     */
    async getApiCache(service, query) {
        const key = `api:${service}:${Buffer.from(query).toString('base64')}`;
        return this.get(key);
    }

    /**
     * Cache API response
     * @param {string} service - Service name
     * @param {string} query - Query string
     * @param {any} response - Response to cache
     * @param {number} ttl - TTL in seconds (default: 5 minutes)
     */
    async setApiCache(service, query, response, ttl = this.TTL.API_RESPONSE) {
        const key = `api:${service}:${Buffer.from(query).toString('base64')}`;
        await this.set(key, response, ttl);
    }

    // ========================================
    // Statistics
    // ========================================

    /**
     * Increment a counter
     * @param {string} key - Counter key
     */
    async increment(key) {
        try {
            if (this.isConnected) {
                return await this.client.incr(key);
            }
            const current = this.fallbackCache.get(key) || 0;
            this.fallbackCache.set(key, current + 1);
            return current + 1;
        } catch (error) {
            console.error('[Redis] Increment error:', error.message);
            return 0;
        }
    }

    /**
     * Get cache stats
     */
    async getStats() {
        return {
            connected: this.isConnected,
            fallbackSize: this.fallbackCache.size,
            redisInfo: this.isConnected ? await this.client.info('memory') : null,
        };
    }

    // ========================================
    // Spam & Duplicate Tracking (AutoMod)
    // ========================================

    /**
     * Track a message for spam detection
     * Returns the count of messages in the time window
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {number} windowSeconds - Time window in seconds
     * @returns {Promise<number>} Message count in window
     */
    async trackSpamMessage(guildId, userId, windowSeconds = 5) {
        const key = `spam:${guildId}:${userId}`;
        try {
            if (this.isConnected) {
                const multi = this.client.multi();
                multi.incr(key);
                multi.expire(key, windowSeconds);
                const results = await multi.exec();
                return results[0][1]; // Get the INCR result
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
        } catch (error) {
            console.error('[Redis] trackSpamMessage error:', error.message);
            return 1;
        }
    }

    /**
     * Reset spam tracker for a user
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     */
    async resetSpamTracker(guildId, userId) {
        const key = `spam:${guildId}:${userId}`;
        await this.delete(key);
    }

    /**
     * Track duplicate messages
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {string} content - Message content (will be hashed)
     * @param {number} windowSeconds - Time window in seconds
     * @returns {Promise<{count: number, isNew: boolean}>} Count and whether it's a new content
     */
    async trackDuplicateMessage(guildId, userId, content, windowSeconds = 30) {
        // Create a simple hash of the content
        const contentHash = Buffer.from(content.toLowerCase().trim()).toString('base64').slice(0, 32);
        const countKey = `dup:${guildId}:${userId}:count`;
        const hashKey = `dup:${guildId}:${userId}:hash`;
        
        try {
            if (this.isConnected) {
                const storedHash = await this.client.get(hashKey);
                
                if (storedHash !== contentHash) {
                    // New content - reset counter
                    const multi = this.client.multi();
                    multi.set(hashKey, contentHash, 'EX', windowSeconds);
                    multi.set(countKey, 1, 'EX', windowSeconds);
                    await multi.exec();
                    return { count: 1, isNew: true };
                }
                
                // Same content - increment
                const multi = this.client.multi();
                multi.incr(countKey);
                multi.expire(countKey, windowSeconds);
                multi.expire(hashKey, windowSeconds);
                const results = await multi.exec();
                return { count: results[0][1], isNew: false };
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
        } catch (error) {
            console.error('[Redis] trackDuplicateMessage error:', error.message);
            return { count: 1, isNew: true };
        }
    }

    /**
     * Reset duplicate tracker for a user
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     */
    async resetDuplicateTracker(guildId, userId) {
        await this.delete(`dup:${guildId}:${userId}:count`);
        await this.delete(`dup:${guildId}:${userId}:hash`);
        this.fallbackCache.delete(`dup:${guildId}:${userId}`);
    }

    /**
     * Track automod warnings for escalation
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {number} resetHours - Hours until warning count resets
     * @returns {Promise<number>} Current warning count
     */
    async trackAutomodWarn(guildId, userId, resetHours = 1) {
        const key = `automod:warn:${guildId}:${userId}`;
        const ttlSeconds = resetHours * 3600;
        
        try {
            if (this.isConnected) {
                const multi = this.client.multi();
                multi.incr(key);
                multi.expire(key, ttlSeconds);
                const results = await multi.exec();
                return results[0][1];
            }
            // Fallback
            const current = (this.fallbackCache.get(key) || 0) + 1;
            this.fallbackCache.set(key, current);
            setTimeout(() => this.fallbackCache.delete(key), ttlSeconds * 1000);
            return current;
        } catch (error) {
            console.error('[Redis] trackAutomodWarn error:', error.message);
            return 1;
        }
    }

    /**
     * Get current automod warning count
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @returns {Promise<number>} Current warning count
     */
    async getAutomodWarnCount(guildId, userId) {
        const key = `automod:warn:${guildId}:${userId}`;
        try {
            if (this.isConnected) {
                const count = await this.client.get(key);
                return parseInt(count) || 0;
            }
            return this.fallbackCache.get(key) || 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Reset automod warning count
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     */
    async resetAutomodWarn(guildId, userId) {
        await this.delete(`automod:warn:${guildId}:${userId}`);
    }

    // ========================================
    // Rate Limiting
    // ========================================

    /**
     * Check and consume rate limit
     * @param {string} key - Rate limit key (e.g., 'cmd:userId' or 'api:userId')
     * @param {number} limit - Max requests allowed
     * @param {number} windowSeconds - Time window in seconds
     * @returns {Promise<{allowed: boolean, remaining: number, resetIn: number}>}
     */
    async checkRateLimit(key, limit, windowSeconds) {
        const redisKey = `ratelimit:${key}`;
        
        try {
            if (this.isConnected) {
                const multi = this.client.multi();
                multi.incr(redisKey);
                multi.ttl(redisKey);
                const results = await multi.exec();
                
                const count = results[0][1];
                let ttl = results[1][1];
                
                // Set expiry on first request
                if (ttl === -1) {
                    await this.client.expire(redisKey, windowSeconds);
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
        } catch (error) {
            console.error('[Redis] checkRateLimit error:', error.message);
            return { allowed: true, remaining: limit, resetIn: 0 };
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        if (this.client) {
            await this.client.quit();
            console.log('[Redis] Disconnected');
        }
    }
}

// Singleton instance
const redisCache = new RedisCache();

module.exports = redisCache;
