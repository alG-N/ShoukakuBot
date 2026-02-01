/**
 * Cache Manager
 * Centralized cache management and monitoring
 * @module shared/cache/CacheManager
 */

const { BaseCache } = require('./BaseCache');

/**
 * Cache Manager - creates and tracks all caches
 */
class CacheManager {
    constructor() {
        /** @type {Map<string, BaseCache>} */
        this.caches = new Map();
    }

    /**
     * Create or get a cache
     * @param {string} name - Cache name
     * @param {Object} config - Cache configuration
     * @returns {BaseCache}
     */
    getCache(name, config = {}) {
        if (this.caches.has(name)) {
            return this.caches.get(name);
        }
        
        const cache = new BaseCache(name, config);
        this.caches.set(name, cache);
        return cache;
    }

    /**
     * Create a cache with specific settings
     * @param {string} name - Cache name
     * @param {Object} config - Cache config
     * @returns {BaseCache}
     */
    createCache(name, config = {}) {
        if (this.caches.has(name)) {
            throw new Error(`Cache "${name}" already exists`);
        }
        
        const cache = new BaseCache(name, config);
        this.caches.set(name, cache);
        return cache;
    }

    /**
     * Check if cache exists
     * @param {string} name - Cache name
     * @returns {boolean}
     */
    hasCache(name) {
        return this.caches.has(name);
    }

    /**
     * Delete a cache
     * @param {string} name - Cache name
     * @returns {boolean}
     */
    deleteCache(name) {
        const cache = this.caches.get(name);
        if (cache) {
            cache.destroy();
            return this.caches.delete(name);
        }
        return false;
    }

    /**
     * Clear all caches
     */
    clearAll() {
        for (const cache of this.caches.values()) {
            cache.clear();
        }
    }

    /**
     * Get stats for all caches
     * @returns {Object}
     */
    getAllStats() {
        const stats = {};
        for (const [name, cache] of this.caches) {
            stats[name] = cache.getStats();
        }
        return stats;
    }

    /**
     * Get total memory estimate
     * @returns {Object}
     */
    getMemoryStats() {
        let totalEntries = 0;
        let totalMaxSize = 0;
        
        for (const cache of this.caches.values()) {
            totalEntries += cache.size;
            totalMaxSize += cache.maxSize;
        }
        
        return {
            cacheCount: this.caches.size,
            totalEntries,
            totalMaxSize,
            utilization: `${((totalEntries / totalMaxSize) * 100).toFixed(2)}%`
        };
    }

    /**
     * Destroy all caches
     */
    destroy() {
        for (const cache of this.caches.values()) {
            cache.destroy();
        }
        this.caches.clear();
    }
}

// Global cache manager instance
const globalCacheManager = new CacheManager();

// Pre-create common caches
const apiCache = globalCacheManager.getCache('api', {
    defaultTTL: 600000,  // 10 minutes
    maxSize: 1000
});

const userCache = globalCacheManager.getCache('user', {
    defaultTTL: 300000,  // 5 minutes
    maxSize: 5000
});

const guildCache = globalCacheManager.getCache('guild', {
    defaultTTL: 300000,  // 5 minutes
    maxSize: 2000
});

module.exports = {
    CacheManager,
    globalCacheManager,
    apiCache,
    userCache,
    guildCache
};
