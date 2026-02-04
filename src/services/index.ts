/**
 * Services Module
 * Business logic services organized by feature
 * @module services
 */

// Core Services
export * from './registry/index.js';
export * from './guild/index.js';
export * from './moderation/index.js';

// Feature Services
export * from './music/index.js';
// Note: video and api services still use JavaScript - import them directly when needed
// export * from './video/index.js';
// export * from './api/index.js';
export * from './fun/index.js';

// Middleware (re-export for convenience)
export { 
    AccessType, 
    checkAccess, 
    checkMaintenance, 
    createErrorEmbed, 
    createWarningEmbed 
} from '../middleware/access.js';

// Named imports for direct access
import { CommandRegistry, EventRegistry } from './registry/index.js';
import { GuildSettingsService } from './guild/index.js';
import { moderationService, snipeService } from './moderation/index.js';

// Re-export for backward compatibility
// Note: RedisCache is internal - use CacheService for caching
export {
    CommandRegistry,
    EventRegistry,
    GuildSettingsService,
    moderationService,
    snipeService
};
