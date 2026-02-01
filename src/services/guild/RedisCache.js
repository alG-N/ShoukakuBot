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
