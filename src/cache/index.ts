/**
 * Cache Module
 * Central exports for caching utilities
 * @module cache
 */

// Base Cache
export { BaseCache } from './BaseCache';
export type { CacheEntry, CacheConfig, CacheStats, CacheFactory } from './BaseCache';

// Cache Manager
export { CacheManager, globalCacheManager, apiCache, userCache, guildCache } from './CacheManager';
export type { MemoryStats, AllCacheStats } from './CacheManager';

// Cache Service
export { CacheService, DEFAULT_NAMESPACES } from './CacheService';
export type { NamespaceConfig, CacheMetrics, CacheServiceStats, CacheServiceOptions } from './CacheService';

// Music Caches (moved from repositories/music)
export * as music from './music';
export {
    MusicCache,
    MusicCacheFacade,
    QueueCache,
    UserMusicCache,
    GuildMusicCache,
    VoteCache
} from './music';

// Default export is the unified cache service singleton
import cacheService from './CacheService';
export default cacheService;

// Re-export cacheService as named export
export { cacheService };
// CommonJS COMPATIBILITY
const BaseCacheModule = require('./BaseCache');
const CacheManagerModule = require('./CacheManager');
const CacheServiceModule = require('./CacheService');

module.exports = {
    // Classes
    BaseCache: BaseCacheModule.BaseCache,
    CacheManager: CacheManagerModule.CacheManager,
    CacheService: CacheServiceModule.CacheService,
    
    // Global instances
    globalCacheManager: CacheManagerModule.globalCacheManager,
    cacheService: CacheServiceModule,         // Unified cache (recommended)
    
    // Pre-configured caches (legacy)
    apiCache: CacheManagerModule.apiCache,
    userCache: CacheManagerModule.userCache,
    guildCache: CacheManagerModule.guildCache,
    
    // Constants
    DEFAULT_NAMESPACES: CacheServiceModule.DEFAULT_NAMESPACES,
};
