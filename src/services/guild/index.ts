/**
 * Guild Services Index
 * @module services/guild
 */

// RedisCache is internal - exported only for bootstrap/container initialization
// Application code should use CacheService instead
export { RedisCache, default as redisCache } from './RedisCache.js';

export { 
    DEFAULT_GUILD_SETTINGS,
    getGuildSettings,
    updateGuildSettings,
    getSetting,
    updateSetting,
    getSnipeLimit,
    setSnipeLimit,
    getDeleteLimit,
    setDeleteLimit,
    getLogChannel,
    setLogChannel,
    getModLogChannel,
    setModLogChannel,
    getAdminRoles,
    addAdminRole,
    removeAdminRole,
    getModRoles,
    addModRole,
    removeModRole,
    hasAdminPermission,
    hasModPermission,
    isServerOwner,
    clearCache,
    default as GuildSettingsService,
} from './GuildSettingsService.js';
export type { GuildSettings } from './GuildSettingsService.js';
