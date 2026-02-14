/**
 * Moderation Services Module
 * Central exports for all moderation services
 * @module services/moderation
 */

// Service exports (default exports as named)
export { default as moderationService } from './ModerationService.js';
export { default as snipeService } from './SnipeService.js';
export { default as filterService } from './FilterService.js';
export { default as autoModService } from './AutoModService.js';
export { default as infractionService } from './InfractionService.js';
export { default as modLogService } from './ModLogService.js';
export { default as lockdownService } from './LockdownService.js';
export { default as antiRaidService } from './AntiRaidService.js';

// Type exports - only types that actually exist in TypeScript files
export type { 
    Filter,
    FilterMatch 
} from './FilterService.js';

export type { 
    AutoModSettings,
    Violation 
} from './AutoModService.js';

export type { 
    Infraction 
} from './InfractionService.js';

export type { 
    ModLogSettings 
} from './ModLogService.js';

export type { 
    TrackedMessage 
} from './SnipeService.js';


