/**
 * Guild Settings Service
 * Manages server-specific settings and configurations
 * Uses PostgreSQL with Redis caching for scale
 * @module services/GuildSettingsService
 */

const db = require('../../database/admin');
const redisCache = require('./RedisCache');

// Default settings for new guilds (matches schema.sql guild_settings table)
const DEFAULT_GUILD_SETTINGS = {
    prefix: '!',
    language: 'en',
    welcome_channel: null,
    welcome_message: null,
    log_channel: null,
    mod_log_channel: null,
    music_channel: null,
    dj_role: null,
    mute_role: null,
    auto_role: null,
    settings: {} // JSONB for flexible settings
};

// In-memory cache fallback
const settingsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// GET SETTINGS
// ============================================================================

/**
 * Get guild settings, creating default if not exists
 * Uses Redis cache first, then PostgreSQL
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Guild settings object
 */
async function getGuildSettings(guildId) {
    try {
        // Check Redis cache first
        const cached = await redisCache.getGuildSettings(guildId);
        if (cached) {
            return cached;
        }

        // Check in-memory cache as fallback
        const memoryCached = settingsCache.get(guildId);
        if (memoryCached && Date.now() - memoryCached.timestamp < CACHE_TTL) {
            return memoryCached.data;
        }

        const row = await db.getOne(
            'SELECT * FROM guild_settings WHERE guild_id = $1',
            [guildId]
        );

        if (row) {
            // Parse JSONB settings field
            const settings = {
                guild_id: row.guild_id,
                prefix: row.prefix,
                language: row.language,
                welcome_channel: row.welcome_channel,
                welcome_message: row.welcome_message,
                log_channel: row.log_channel,
                mod_log_channel: row.mod_log_channel,
                music_channel: row.music_channel,
                dj_role: row.dj_role,
                mute_role: row.mute_role,
                auto_role: row.auto_role,
                settings: row.settings || {},
                created_at: row.created_at,
                updated_at: row.updated_at
            };

            // Update both caches
            await redisCache.setGuildSettings(guildId, settings);
            settingsCache.set(guildId, { data: settings, timestamp: Date.now() });
            return settings;
        }

        // Create default settings using upsert
        const newSettings = await db.upsert('guild_settings', {
            guild_id: guildId,
            ...DEFAULT_GUILD_SETTINGS,
            settings: JSON.stringify(DEFAULT_GUILD_SETTINGS.settings)
        }, 'guild_id');

        const result = {
            guild_id: guildId,
            ...DEFAULT_GUILD_SETTINGS,
            created_at: newSettings?.created_at || new Date(),
            updated_at: newSettings?.updated_at || new Date()
        };

        settingsCache.set(guildId, { data: result, timestamp: Date.now() });
        return result;

    } catch (error) {
        console.error('[GuildSettings] Error getting settings:', error);
        return { guild_id: guildId, ...DEFAULT_GUILD_SETTINGS };
    }
}

// ============================================================================
// UPDATE SETTINGS
// ============================================================================

/**
 * Update guild settings
 * @param {string} guildId - Guild ID
 * @param {Object} updates - Settings to update
 * @returns {Promise<Object>} Updated settings
 */
async function updateGuildSettings(guildId, updates) {
    // Ensure guild exists
    await getGuildSettings(guildId);

    const allowedFields = [
        'prefix', 'language', 'welcome_channel', 'welcome_message',
        'log_channel', 'mod_log_channel', 'music_channel', 'dj_role',
        'mute_role', 'auto_role', 'settings'
    ];

    const filteredUpdates = {};
    for (const key of Object.keys(updates)) {
        if (allowedFields.includes(key)) {
            filteredUpdates[key] = updates[key];
        }
    }

    // Stringify settings object if present
    if (filteredUpdates.settings && typeof filteredUpdates.settings === 'object') {
        filteredUpdates.settings = JSON.stringify(filteredUpdates.settings);
    }

    if (Object.keys(filteredUpdates).length === 0) {
        return getGuildSettings(guildId);
    }

    try {
        await db.update('guild_settings', filteredUpdates, { guild_id: guildId });
        
        // Invalidate both caches
        await redisCache.invalidateGuildSettings(guildId);
        settingsCache.delete(guildId);
        
        return getGuildSettings(guildId);
    } catch (error) {
        console.error('[GuildSettings] Error updating settings:', error);
        throw error;
    }
}

/**
 * Update nested settings in JSONB field
 * @param {string} guildId - Guild ID
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 */
async function updateSetting(guildId, key, value) {
    const current = await getGuildSettings(guildId);
    const settings = { ...current.settings, [key]: value };
    return updateGuildSettings(guildId, { settings });
}

/**
 * Get a specific setting from JSONB
 */
async function getSetting(guildId, key, defaultValue = null) {
    const settings = await getGuildSettings(guildId);
    return settings.settings?.[key] ?? defaultValue;
}

// ============================================================================
// SPECIFIC SETTING HELPERS
// ============================================================================

async function getSnipeLimit(guildId) {
    return getSetting(guildId, 'snipe_limit', 10);
}

async function setSnipeLimit(guildId, limit) {
    const clampedLimit = Math.max(1, Math.min(50, limit));
    return updateSetting(guildId, 'snipe_limit', clampedLimit);
}

async function getDeleteLimit(guildId) {
    return getSetting(guildId, 'delete_limit', 100);
}

async function setDeleteLimit(guildId, limit) {
    const clampedLimit = Math.max(1, Math.min(500, limit));
    return updateSetting(guildId, 'delete_limit', clampedLimit);
}

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

// ============================================================================
// ROLE MANAGEMENT (stored in JSONB settings)
// ============================================================================

async function getAdminRoles(guildId) {
    return getSetting(guildId, 'admin_roles', []);
}

async function addAdminRole(guildId, roleId) {
    const roles = await getAdminRoles(guildId);
    if (!roles.includes(roleId)) {
        roles.push(roleId);
    }
    return updateSetting(guildId, 'admin_roles', roles);
}

async function removeAdminRole(guildId, roleId) {
    const roles = await getAdminRoles(guildId);
    return updateSetting(guildId, 'admin_roles', roles.filter(r => r !== roleId));
}

async function getModRoles(guildId) {
    return getSetting(guildId, 'mod_roles', []);
}

async function addModRole(guildId, roleId) {
    const roles = await getModRoles(guildId);
    if (!roles.includes(roleId)) {
        roles.push(roleId);
    }
    return updateSetting(guildId, 'mod_roles', roles);
}

async function removeModRole(guildId, roleId) {
    const roles = await getModRoles(guildId);
    return updateSetting(guildId, 'mod_roles', roles.filter(r => r !== roleId));
}

// ============================================================================
// PERMISSION CHECKING
// ============================================================================

async function hasAdminPermission(member) {
    if (member.guild.ownerId === member.id) return true;
    if (member.permissions.has('Administrator')) return true;

    const adminRoles = await getAdminRoles(member.guild.id);
    return member.roles.cache.some(role => adminRoles.includes(role.id));
}

async function hasModPermission(member) {
    if (await hasAdminPermission(member)) return true;
    if (member.permissions.has('ModerateMembers') || 
        member.permissions.has('KickMembers') ||
        member.permissions.has('BanMembers')) {
        return true;
    }

    const modRoles = await getModRoles(member.guild.id);
    return member.roles.cache.some(role => modRoles.includes(role.id));
}

function isServerOwner(member) {
    return member.guild.ownerId === member.id;
}

/**
 * Clear cache for a guild (useful after direct DB updates)
 */
function clearCache(guildId) {
    if (guildId) {
        settingsCache.delete(guildId);
    } else {
        settingsCache.clear();
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    DEFAULT_GUILD_SETTINGS,
    getGuildSettings,
    updateGuildSettings,
    updateSetting,
    getSetting,
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
    clearCache
};
