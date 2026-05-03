/**
 * Moderation Services Module
 * Central exports for all moderation services
 * @module services/moderation
 */

// Service exports (default exports as named)
export { default as moderationService } from './moderationService.js';
export { default as snipeService } from './snipeService.js';
export { default as filterService } from './filterService.js';
export { default as autoModService } from './autoModService.js';
export { default as infractionService } from './infractionService.js';
export { default as modLogService } from './modLogService.js';
export { default as lockdownService } from './lockdownService.js';
export { default as antiRaidService } from './antiRaidService.js';

// Type exports - only types that actually exist in TypeScript files
export { type Filter, type FilterMatch } from './filterService.js';
export { type AutoModSettings, type Violation } from './autoModService.js';
export { type Infraction } from './infractionService.js';
export { type ModLogSettings } from '../../types/moderation/modlog.js';
export { type TrackedMessage } from './snipeService.js';




