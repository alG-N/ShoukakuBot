/**
 * Base Cache Class
 * LRU cache with TTL support
 * @module shared/cache/BaseCache
 */

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {any} value - Cached value
 * @property {number} expiresAt - Expiration timestamp
 * @property {number} lastAccessed - Last access timestamp
 */

class BaseCache {
    /**
     * @param {string} cacheName - Name for logging/debugging
     * @param {Object} config - Cache configuration
     * @param {number} config.defaultTTL - Default TTL in ms
     * @param {number} config.maxSize - Maximum entries
     * @param {number} config.cleanupInterval - Cleanup interval in ms
     */
    constructor(cacheName, config = {}) {
        this.cacheName = cacheName;
        this.defaultTTL = config.defaultTTL || 300000; // 5 minutes
        this.maxSize = config.maxSize || 500;
        this.cache = new Map();
        
        // Stats for monitoring
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
        
        // Auto cleanup
        this.cleanupInterval = setInterval(
            () => this._cleanup(),
            config.cleanupInterval || 60000
        );
    }

    /**
     * Get value from cache
     * @param {string} key - Cache key
     * @returns {any|null} Cached value or null
     */
    get(key) {
        const entry = this.cache.get(key);
        
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }
        
        // Update LRU tracking
        entry.lastAccessed = Date.now();
        this.stats.hits++;
        return entry.value;
    }

    /**
     * Set value in cache
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - TTL in ms (uses default if not provided)
     */
    set(key, value, ttl = this.defaultTTL) {
        // Evict if at capacity
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this._evictLRU();
        }
        
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + ttl,
            lastAccessed: Date.now()
        });
    }

    /**
     * Check if key exists (and is valid)
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    has(key) {
        return this.get(key) !== null;
    }

    /**
     * Delete a key
     * @param {string} key - Cache key
     * @returns {boolean} Whether key was deleted
     */
    delete(key) {
        return this.cache.delete(key);
    }

    /**
     * Clear all entries
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Get or set pattern
     * @param {string} key - Cache key
     * @param {Function} fetcher - Async function to fetch value if not cached
     * @param {number} ttl - TTL for new entries
     * @returns {Promise<any>}
     */
    async getOrSet(key, fetcher, ttl = this.defaultTTL) {
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }
        
        const value = await fetcher();
        this.set(key, value, ttl);
        return value;
    }

    /**
     * Get multiple keys
     * @param {string[]} keys - Cache keys
     * @returns {Map<string, any>} Map of found values
     */
    getMany(keys) {
        const results = new Map();
        for (const key of keys) {
            const value = this.get(key);
            if (value !== null) {
                results.set(key, value);
            }
        }
        return results;
    }

    /**
     * Set multiple key-value pairs
     * @param {Object} entries - Object of key-value pairs
     * @param {number} ttl - TTL for all entries
     */
    setMany(entries, ttl = this.defaultTTL) {
        for (const [key, value] of Object.entries(entries)) {
            this.set(key, value, ttl);
        }
    }

    /**
     * Evict least recently used entry
     * @private
     */
    _evictLRU() {
        let oldestKey = null;
        let oldestTime = Infinity;
        
        for (const [key, entry] of this.cache) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.stats.evictions++;
        }
    }

    /**
     * Cleanup expired entries
     * @private
     */
    _cleanup() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, entry] of this.cache) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            // Debug logging could go here
        }
    }

    /**
     * Get cache statistics
     * @returns {Object}
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
            : 0;
            
        return {
            name: this.cacheName,
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: `${hitRate}%`,
            evictions: this.stats.evictions
        };
    }

    /**
     * Reset stats
     */
    resetStats() {
        this.stats = { hits: 0, misses: 0, evictions: 0 };
    }

    /**
     * Get all keys
     * @returns {string[]}
     */
    keys() {
        return Array.from(this.cache.keys());
    }

    /**
     * Get size
     * @returns {number}
     */
    get size() {
        return this.cache.size;
    }

    /**
     * Destroy cache and cleanup
     */
    destroy() {
        clearInterval(this.cleanupInterval);
        this.cache.clear();
    }
}

module.exports = { BaseCache };
