/**
 * Service Provider - Registers all services with the container
 * This is the central place for dependency configuration
 * Note: Uses require() for lazy loading in factory functions
 * @module bootstrap/services
 */

import container from '../container.js';
import { logger } from '../core/Logger.js';

// Pre-import modules to avoid require() - loaded at registration time
import { PostgresDatabase } from '../database/postgres.js';
import { RedisCache } from '../services/guild/RedisCache.js';
import { CacheService } from '../cache/CacheService.js';
import { CommandRegistry } from '../services/registry/CommandRegistry.js';
import { EventRegistry } from '../services/registry/EventRegistry.js';
import { LavalinkService } from '../services/music/LavalinkService.js';
import { WikipediaService } from '../services/api/wikipediaService.js';
import { GoogleService } from '../services/api/googleService.js';
import { FandomService } from '../services/api/fandomService.js';

// Service Registration
/**
 * Register all application services
 * Call this once during application startup
 */
export function registerServices(): void {
    logger.info('Container', 'Registering services with DI container...');
    // CORE SERVICES
    // Database
    container.register('database', () => {
        return new PostgresDatabase();
    }, { tags: ['core', 'database'] });

    // Redis Cache (low-level - internal use only)
    container.register('redisCache', () => {
        return new RedisCache();
    }, { tags: ['core', 'cache'] });

    // Unified Cache Service (recommended for all caching)
    container.register('cacheService', () => {
        return new CacheService();
    }, { tags: ['core', 'cache'] });
    // REGISTRY SERVICES
    container.register('commandRegistry', () => {
        return new CommandRegistry();
    }, { tags: ['core', 'registry'] });

    container.register('eventRegistry', () => {
        return new EventRegistry();
    }, { tags: ['core', 'registry'] });
    // MUSIC SERVICES (when enabled)
    container.register('lavalink', () => {
        return new LavalinkService();
    }, { tags: ['music'] });

    // API SERVICES (for proper cleanup interval management)
    container.register('wikipediaService', () => {
        return new WikipediaService();
    }, { tags: ['api'] });

    container.register('googleService', () => {
        return new GoogleService();
    }, { tags: ['api'] });

    container.register('fandomService', () => {
        return new FandomService();
    }, { tags: ['api'] });

    logger.info('Container', 'All services registered');
}

export default { registerServices };
