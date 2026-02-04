"use strict";
/**
 * Service Provider - Registers all services with the container
 * This is the central place for dependency configuration
 * Note: Uses require() for lazy loading in factory functions
 * @module bootstrap/services
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerServices = registerServices;
const container_js_1 = __importDefault(require("../container.js"));
const Logger_js_1 = require("../core/Logger.js");
// Pre-import modules to avoid require() - loaded at registration time
const postgres_js_1 = require("../database/postgres.js");
const RedisCache_js_1 = require("../services/guild/RedisCache.js");
const CacheService_js_1 = require("../cache/CacheService.js");
const CommandRegistry_js_1 = require("../services/registry/CommandRegistry.js");
const EventRegistry_js_1 = require("../services/registry/EventRegistry.js");
const LavalinkService_js_1 = require("../services/music/LavalinkService.js");
const wikipediaService_js_1 = require("../services/api/wikipediaService.js");
const googleService_js_1 = require("../services/api/googleService.js");
const fandomService_js_1 = require("../services/api/fandomService.js");
// Service Registration
/**
 * Register all application services
 * Call this once during application startup
 */
function registerServices() {
    Logger_js_1.logger.info('Container', 'Registering services with DI container...');
    // CORE SERVICES
    // Database
    container_js_1.default.register('database', () => {
        return new postgres_js_1.PostgresDatabase();
    }, { tags: ['core', 'database'] });
    // Redis Cache (low-level - internal use only)
    container_js_1.default.register('redisCache', () => {
        return new RedisCache_js_1.RedisCache();
    }, { tags: ['core', 'cache'] });
    // Unified Cache Service (recommended for all caching)
    container_js_1.default.register('cacheService', () => {
        return new CacheService_js_1.CacheService();
    }, { tags: ['core', 'cache'] });
    // REGISTRY SERVICES
    container_js_1.default.register('commandRegistry', () => {
        return new CommandRegistry_js_1.CommandRegistry();
    }, { tags: ['core', 'registry'] });
    container_js_1.default.register('eventRegistry', () => {
        return new EventRegistry_js_1.EventRegistry();
    }, { tags: ['core', 'registry'] });
    // MUSIC SERVICES (when enabled)
    container_js_1.default.register('lavalink', () => {
        return new LavalinkService_js_1.LavalinkService();
    }, { tags: ['music'] });
    // API SERVICES (for proper cleanup interval management)
    container_js_1.default.register('wikipediaService', () => {
        return new wikipediaService_js_1.WikipediaService();
    }, { tags: ['api'] });
    container_js_1.default.register('googleService', () => {
        return new googleService_js_1.GoogleService();
    }, { tags: ['api'] });
    container_js_1.default.register('fandomService', () => {
        return new fandomService_js_1.FandomService();
    }, { tags: ['api'] });
    Logger_js_1.logger.info('Container', 'All services registered');
}
exports.default = { registerServices };
//# sourceMappingURL=services.js.map