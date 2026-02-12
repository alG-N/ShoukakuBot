/**
 * Access Middleware — Re-export Layer
 * 
 * This file was split into smaller focused modules:
 * - rateLimiter.ts — RateLimiter, DistributedRateLimiter
 * - permissions.ts — hasPermissions, isServerAdmin, isServerOwner, canModerate, botCanModerate
 * - checks.ts      — checkAccess, checkMaintenance, checkNSFW, validateVideoUrl, AccessType
 * - embeds.ts      — createErrorEmbed, createWarningEmbed, createSuccessEmbed, createInfoEmbed, createCooldownEmbed
 * 
 * All exports are re-exported here for backward compatibility.
 * New code should import from the specific module directly.
 */

// Rate Limiting
export { RateLimiter, DistributedRateLimiter } from './rateLimiter.js';
export type { RateLimiterOptions, DistributedRateLimiterOptions, RateLimitCheckResult } from './rateLimiter.js';

// Permissions
export { hasPermissions, isServerAdmin, isServerOwner, canModerate, botCanModerate, validators } from './permissions.js';
export type { ModerateResult } from './permissions.js';

// Access Control & Checks
export { AccessType, checkAccess, checkMaintenance, checkNSFW, validateVideoUrl } from './checks.js';
export type { ValidationResult, AccessCheckResult, MaintenanceCheckResult, AccessTypeValue, AnyInteraction } from './checks.js';

// Embed Helpers
export { createErrorEmbed, createWarningEmbed, createSuccessEmbed, createInfoEmbed, createCooldownEmbed } from './embeds.js';

// Default export (backward compatibility)
import { AccessType, checkAccess, checkMaintenance, checkNSFW } from './checks.js';
import { RateLimiter, DistributedRateLimiter } from './rateLimiter.js';
import { validators } from './permissions.js';
import { createErrorEmbed, createWarningEmbed, createSuccessEmbed, createInfoEmbed, createCooldownEmbed } from './embeds.js';

export default {
    AccessType,
    RateLimiter,
    DistributedRateLimiter,
    validators,
    checkMaintenance,
    checkNSFW,
    checkAccess,
    createErrorEmbed,
    createWarningEmbed,
    createSuccessEmbed,
    createInfoEmbed,
    createCooldownEmbed
};
