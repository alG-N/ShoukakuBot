"use strict";
/**
 * Guild Settings Service
 * Manages server settings with Redis + PostgreSQL caching
 * @module services/guild/GuildSettingsService
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_GUILD_SETTINGS = void 0;
exports.getGuildSettings = getGuildSettings;
exports.updateGuildSettings = updateGuildSettings;
exports.getSetting = getSetting;
exports.updateSetting = updateSetting;
exports.getSnipeLimit = getSnipeLimit;
exports.setSnipeLimit = setSnipeLimit;
exports.getDeleteLimit = getDeleteLimit;
exports.setDeleteLimit = setDeleteLimit;
exports.getLogChannel = getLogChannel;
exports.setLogChannel = setLogChannel;
exports.getModLogChannel = getModLogChannel;
exports.setModLogChannel = setModLogChannel;
exports.getAdminRoles = getAdminRoles;
exports.addAdminRole = addAdminRole;
exports.removeAdminRole = removeAdminRole;
exports.getModRoles = getModRoles;
exports.addModRole = addModRole;
exports.removeModRole = removeModRole;
exports.hasAdminPermission = hasAdminPermission;
exports.hasModPermission = hasModPermission;
exports.isServerOwner = isServerOwner;
exports.clearCache = clearCache;
const CacheService_js_1 = __importDefault(require("../../cache/CacheService.js"));
// Use require for CommonJS database module
const db = require('../../database/postgres.js');
// DEFAULT SETTINGS
exports.DEFAULT_GUILD_SETTINGS = {
    guild_id: '0',
    prefix: '!',
    language: 'en',
    log_channel: null,
    mod_log_channel: null,
    welcome_channel: null,
    welcome_message: null,
    goodbye_message: null,
    auto_role: null,
    admin_roles: [],
    mod_roles: [],
    snipe_limit: 10,
    delete_limit: 100,
    music_channel: null,
    dj_role: null,
    volume: 100,
    automod_enabled: false,
    spam_threshold: 5,
    duplicate_threshold: 3,
    mention_threshold: 5,
    invite_filter: false,
    link_filter: false,
    caps_filter: false,
    caps_threshold: 70,
    max_newlines: 10,
    max_message_length: 0,
    filter_words: [],
    exempt_channels: [],
    exempt_roles: [],
    muted_role: null,
    raid_mode: false,
    lockdown: false,
    settings: {},
};
// CORE FUNCTIONS
/**
 * Get guild settings with Redis + PostgreSQL fallback
 */
async function getGuildSettings(guildId) {
    // Check Redis cache first
    const cached = await CacheService_js_1.default.getGuildSettings(guildId);
    if (cached) {
        return { ...exports.DEFAULT_GUILD_SETTINGS, ...cached };
    }
    try {
        // Get from database using direct query
        const dbSettings = await db.getOne('SELECT * FROM guild_settings WHERE guild_id = $1', [guildId]);
        if (dbSettings) {
            const settings = { ...exports.DEFAULT_GUILD_SETTINGS, ...dbSettings };
            await CacheService_js_1.default.setGuildSettings(guildId, settings);
            return settings;
        }
        // Create default settings if none exist
        const defaultSettings = { ...exports.DEFAULT_GUILD_SETTINGS, guild_id: guildId };
        await db.upsert('guild_settings', { guild_id: guildId }, 'guild_id');
        await CacheService_js_1.default.setGuildSettings(guildId, defaultSettings);
        return defaultSettings;
    }
    catch (error) {
        console.error('[GuildSettings] Error getting settings:', error.message);
        return { ...exports.DEFAULT_GUILD_SETTINGS, guild_id: guildId };
    }
}
/**
 * Update guild settings
 */
async function updateGuildSettings(guildId, updates) {
    try {
        await db.update('guild_settings', updates, { guild_id: guildId });
        await CacheService_js_1.default.invalidateGuildSettings(guildId);
        return true;
    }
    catch (error) {
        console.error('[GuildSettings] Error updating settings:', error.message);
        return false;
    }
}
/**
 * Get a specific setting from JSONB field
 */
async function getSetting(guildId, key, defaultValue) {
    const settings = await getGuildSettings(guildId);
    const value = settings.settings?.[key];
    return value ?? defaultValue;
}
/**
 * Update a specific setting in JSONB field
 */
async function updateSetting(guildId, key, value) {
    const settings = await getGuildSettings(guildId);
    const newSettings = { ...settings.settings, [key]: value };
    return updateGuildSettings(guildId, { settings: newSettings });
}
// SNIPE & DELETE LIMITS
async function getSnipeLimit(guildId) {
    const settings = await getGuildSettings(guildId);
    return settings.snipe_limit ?? exports.DEFAULT_GUILD_SETTINGS.snipe_limit;
}
async function setSnipeLimit(guildId, limit) {
    return updateGuildSettings(guildId, { snipe_limit: Math.max(1, Math.min(50, limit)) });
}
async function getDeleteLimit(guildId) {
    const settings = await getGuildSettings(guildId);
    return settings.delete_limit ?? exports.DEFAULT_GUILD_SETTINGS.delete_limit;
}
async function setDeleteLimit(guildId, limit) {
    return updateGuildSettings(guildId, { delete_limit: Math.max(1, Math.min(1000, limit)) });
}
// LOG CHANNELS
async function getLogChannel(guildId) {
    const settings = await getGuildSettings(guildId);
    return settings.log_channel;
}
async function setLogChannel(guildId, channelId) {
    return updateGuildSettings(guildId, { log_channel: channelId });
}
async function getModLogChannel(guildId) {
    const settings = await getGuildSettings(guildId);
    return settings.mod_log_channel;
}
async function setModLogChannel(guildId, channelId) {
    return updateGuildSettings(guildId, { mod_log_channel: channelId });
}
// ADMIN ROLES
async function getAdminRoles(guildId) {
    const settings = await getGuildSettings(guildId);
    return settings.admin_roles || [];
}
async function addAdminRole(guildId, roleId) {
    const roles = await getAdminRoles(guildId);
    if (roles.includes(roleId))
        return true;
    return updateGuildSettings(guildId, { admin_roles: [...roles, roleId] });
}
async function removeAdminRole(guildId, roleId) {
    const roles = await getAdminRoles(guildId);
    return updateGuildSettings(guildId, { admin_roles: roles.filter(r => r !== roleId) });
}
// MOD ROLES
async function getModRoles(guildId) {
    const settings = await getGuildSettings(guildId);
    return settings.mod_roles || [];
}
async function addModRole(guildId, roleId) {
    const roles = await getModRoles(guildId);
    if (roles.includes(roleId))
        return true;
    return updateGuildSettings(guildId, { mod_roles: [...roles, roleId] });
}
async function removeModRole(guildId, roleId) {
    const roles = await getModRoles(guildId);
    return updateGuildSettings(guildId, { mod_roles: roles.filter(r => r !== roleId) });
}
// PERMISSION CHECKS
/**
 * Check if member has admin permission
 */
async function hasAdminPermission(member) {
    // Server owner always has admin
    if (isServerOwner(member))
        return true;
    // Discord Administrator permission
    if (member.permissions.has('Administrator'))
        return true;
    // Check custom admin roles
    const adminRoles = await getAdminRoles(member.guild.id);
    return member.roles.cache.some((role) => adminRoles.includes(role.id));
}
/**
 * Check if member has moderator permission
 */
async function hasModPermission(member) {
    // Admin permission includes mod permission
    if (await hasAdminPermission(member))
        return true;
    // Check mod roles
    const modRoles = await getModRoles(member.guild.id);
    return member.roles.cache.some((role) => modRoles.includes(role.id));
}
/**
 * Check if member is the server owner
 */
function isServerOwner(member) {
    return member.id === member.guild.ownerId;
}
// CACHE MANAGEMENT
/**
 * Clear cached settings for a guild
 */
async function clearCache(guildId) {
    await CacheService_js_1.default.invalidateGuildSettings(guildId);
}
// EXPORTS
exports.default = {
    DEFAULT_GUILD_SETTINGS: exports.DEFAULT_GUILD_SETTINGS,
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
};
//# sourceMappingURL=GuildSettingsService.js.map