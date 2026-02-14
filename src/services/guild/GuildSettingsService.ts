/**
 * Guild Settings Service
 * Manages server settings with Redis + PostgreSQL caching
 * @module services/guild/GuildSettingsService
 */

import type { GuildMember, Snowflake, Role } from 'discord.js';
import cacheService from '../../cache/CacheService.js';
import logger from '../../core/Logger.js';
import db from '../../database/postgres.js';
// TYPES
export interface GuildSettings {
    guild_id: Snowflake;
    prefix: string;
    language: string;
    log_channel: Snowflake | null;
    mod_log_channel: Snowflake | null;
    welcome_channel: Snowflake | null;
    welcome_message: string | null;
    goodbye_message: string | null;
    auto_role: Snowflake | null;
    admin_roles: Snowflake[];
    mod_roles: Snowflake[];
    snipe_limit: number;
    delete_limit: number;
    music_channel: Snowflake | null;
    dj_role: Snowflake | null;
    volume: number;
    automod_enabled: boolean;
    spam_threshold: number;
    duplicate_threshold: number;
    mention_threshold: number;
    invite_filter: boolean;
    link_filter: boolean;
    caps_filter: boolean;
    caps_threshold: number;
    max_newlines: number;
    max_message_length: number;
    filter_words: string[];
    exempt_channels: Snowflake[];
    exempt_roles: Snowflake[];
    muted_role: Snowflake | null;
    raid_mode: boolean;
    lockdown: boolean;
    settings: Record<string, unknown>;
}
// DEFAULT SETTINGS
export const DEFAULT_GUILD_SETTINGS: GuildSettings = {
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
export async function getGuildSettings(guildId: Snowflake): Promise<GuildSettings> {
    // Check Redis cache first
    const cached = await cacheService.getGuildSettings<GuildSettings>(guildId);
    if (cached) {
        return { ...DEFAULT_GUILD_SETTINGS, ...cached };
    }

    try {
        // Get from database using direct query
        const dbSettings = await db.getOne(
            'SELECT * FROM guild_settings WHERE guild_id = $1',
            [guildId]
        ) as Partial<GuildSettings> | null;
        
        if (dbSettings) {
            const settings: GuildSettings = { ...DEFAULT_GUILD_SETTINGS, ...dbSettings };
            await cacheService.setGuildSettings(guildId, settings);
            return settings;
        }

        // Create default settings if none exist
        const defaultSettings: GuildSettings = { ...DEFAULT_GUILD_SETTINGS, guild_id: guildId };
        await db.upsert('guild_settings', { guild_id: guildId }, 'guild_id');
        await cacheService.setGuildSettings(guildId, defaultSettings);
        return defaultSettings;
    } catch (error) {
        logger.error('GuildSettings', `Error getting settings: ${(error as Error).message}`);
        return { ...DEFAULT_GUILD_SETTINGS, guild_id: guildId };
    }
}

/**
 * Update guild settings
 */
export async function updateGuildSettings(
    guildId: Snowflake, 
    updates: Partial<GuildSettings>
): Promise<boolean> {
    try {
        await db.update('guild_settings', updates as Record<string, unknown>, { guild_id: guildId });
        await cacheService.invalidateGuildSettings(guildId);
        return true;
    } catch (error) {
        logger.error('GuildSettings', `Error updating settings: ${(error as Error).message}`);
        return false;
    }
}

/**
 * Get a specific setting from JSONB field
 */
export async function getSetting<T = unknown>(
    guildId: Snowflake, 
    key: string, 
    defaultValue: T
): Promise<T> {
    const settings = await getGuildSettings(guildId);
    const value = settings.settings?.[key];
    return (value as T) ?? defaultValue;
}

/**
 * Update a specific setting in JSONB field
 */
export async function updateSetting(
    guildId: Snowflake, 
    key: string, 
    value: unknown
): Promise<boolean> {
    const settings = await getGuildSettings(guildId);
    const newSettings = { ...settings.settings, [key]: value };
    return updateGuildSettings(guildId, { settings: newSettings });
}
// SNIPE & DELETE LIMITS
export async function getSnipeLimit(guildId: Snowflake): Promise<number> {
    const settings = await getGuildSettings(guildId);
    return settings.snipe_limit ?? DEFAULT_GUILD_SETTINGS.snipe_limit;
}

export async function setSnipeLimit(guildId: Snowflake, limit: number): Promise<boolean> {
    return updateGuildSettings(guildId, { snipe_limit: Math.max(1, Math.min(50, limit)) });
}

export async function getDeleteLimit(guildId: Snowflake): Promise<number> {
    const settings = await getGuildSettings(guildId);
    return settings.delete_limit ?? DEFAULT_GUILD_SETTINGS.delete_limit;
}

export async function setDeleteLimit(guildId: Snowflake, limit: number): Promise<boolean> {
    return updateGuildSettings(guildId, { delete_limit: Math.max(1, Math.min(1000, limit)) });
}
// LOG CHANNELS
export async function getLogChannel(guildId: Snowflake): Promise<Snowflake | null> {
    const settings = await getGuildSettings(guildId);
    return settings.log_channel;
}

export async function setLogChannel(guildId: Snowflake, channelId: Snowflake | null): Promise<boolean> {
    return updateGuildSettings(guildId, { log_channel: channelId });
}

export async function getModLogChannel(guildId: Snowflake): Promise<Snowflake | null> {
    const settings = await getGuildSettings(guildId);
    return settings.mod_log_channel;
}

export async function setModLogChannel(guildId: Snowflake, channelId: Snowflake | null): Promise<boolean> {
    return updateGuildSettings(guildId, { mod_log_channel: channelId });
}
// ADMIN ROLES
export async function getAdminRoles(guildId: Snowflake): Promise<Snowflake[]> {
    const settings = await getGuildSettings(guildId);
    return settings.admin_roles || [];
}

export async function addAdminRole(guildId: Snowflake, roleId: Snowflake): Promise<boolean> {
    const roles = await getAdminRoles(guildId);
    if (roles.includes(roleId)) return true;
    return updateGuildSettings(guildId, { admin_roles: [...roles, roleId] });
}

export async function removeAdminRole(guildId: Snowflake, roleId: Snowflake): Promise<boolean> {
    const roles = await getAdminRoles(guildId);
    return updateGuildSettings(guildId, { admin_roles: roles.filter(r => r !== roleId) });
}
// MOD ROLES
export async function getModRoles(guildId: Snowflake): Promise<Snowflake[]> {
    const settings = await getGuildSettings(guildId);
    return settings.mod_roles || [];
}

export async function addModRole(guildId: Snowflake, roleId: Snowflake): Promise<boolean> {
    const roles = await getModRoles(guildId);
    if (roles.includes(roleId)) return true;
    return updateGuildSettings(guildId, { mod_roles: [...roles, roleId] });
}

export async function removeModRole(guildId: Snowflake, roleId: Snowflake): Promise<boolean> {
    const roles = await getModRoles(guildId);
    return updateGuildSettings(guildId, { mod_roles: roles.filter(r => r !== roleId) });
}
// PERMISSION CHECKS
/**
 * Check if member has admin permission
 */
export async function hasAdminPermission(member: GuildMember): Promise<boolean> {
    // Server owner always has admin
    if (isServerOwner(member)) return true;
    
    // Discord Administrator permission
    if (member.permissions.has('Administrator')) return true;
    
    // Check custom admin roles
    const adminRoles = await getAdminRoles(member.guild.id);
    return member.roles.cache.some((role: Role) => adminRoles.includes(role.id));
}

/**
 * Check if member has moderator permission
 */
export async function hasModPermission(member: GuildMember): Promise<boolean> {
    // Admin permission includes mod permission
    if (await hasAdminPermission(member)) return true;
    
    // Check mod roles
    const modRoles = await getModRoles(member.guild.id);
    return member.roles.cache.some((role: Role) => modRoles.includes(role.id));
}

/**
 * Check if member is the server owner
 */
export function isServerOwner(member: GuildMember): boolean {
    return member.id === member.guild.ownerId;
}
// CACHE MANAGEMENT
/**
 * Clear cached settings for a guild
 */
export async function clearCache(guildId: Snowflake): Promise<void> {
    await cacheService.invalidateGuildSettings(guildId);
}
// EXPORTS
export default {
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
};
