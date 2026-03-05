/**
 * Cache Module
 * Central exports for caching utilities
 * @module cache
 */

// Cache Service
export { CacheService, DEFAULT_NAMESPACES } from './CacheService.js';
export { type NamespaceConfig, type CacheMetrics, type CacheServiceStats, type CacheServiceOptions } from './CacheService.js';

// Music Caches (moved from repositories/music)
export * as music from './music/index.js';
export {
    MusicCache,
    MusicCacheFacade,
    QueueCache,
    UserMusicCache,
    GuildMusicCache,
    VoteCache
} from './music/index.js';

// Default export is the unified cache service singleton
import cacheService from './CacheService.js';
export default cacheService;

// Re-export cacheService as named export
export { cacheService };



