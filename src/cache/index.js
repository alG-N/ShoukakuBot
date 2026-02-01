/**
 * Cache Module
 * Central exports for caching utilities
 * @module cache
 */

const { BaseCache } = require('./BaseCache');
const { 
    CacheManager, 
    globalCacheManager, 
    apiCache, 
    userCache, 
    guildCache 
} = require('./CacheManager');

module.exports = {
    // Classes
    BaseCache,
    CacheManager,
    
    // Global instances
    globalCacheManager,
    
    // Pre-configured caches
    apiCache,
    userCache,
    guildCache
};
