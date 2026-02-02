/**
 * Moderation Feature Configuration
 * Central export for all moderation-related configs
 * @module config/features/moderation
 */

const automod = require('./automod');
const punishments = require('./punishments');
const filters = require('./filters');

module.exports = {
    automod,
    punishments,
    filters,
    
    // ==========================================
    // GENERAL MODERATION SETTINGS
    // ==========================================
    
    // Case/Infraction types
    INFRACTION_TYPES: {
        WARN: 'warn',
        MUTE: 'mute',
        UNMUTE: 'unmute',
        KICK: 'kick',
        BAN: 'ban',
        UNBAN: 'unban',
        SOFTBAN: 'softban',
        FILTER: 'filter',      // Triggered by word filter
        AUTOMOD: 'automod',    // Triggered by auto-mod
        NOTE: 'note'           // Mod note (no action)
    },
    
    // Action types for auto-mod/filters
    ACTION_TYPES: {
        DELETE: 'delete',
        DELETE_WARN: 'delete_warn',
        WARN: 'warn',
        MUTE: 'mute',
        KICK: 'kick',
        BAN: 'ban'
    },
    
    // Mod log embed colors
    COLORS: {
        WARN: 0xFFCC00,        // Yellow
        MUTE: 0xFF9900,        // Orange
        UNMUTE: 0x00CC00,      // Green
        KICK: 0xFF6600,        // Dark Orange
        BAN: 0xFF0000,         // Red
        UNBAN: 0x00FF00,       // Bright Green
        SOFTBAN: 0xFF3300,     // Red-Orange
        FILTER: 0x9933FF,      // Purple
        AUTOMOD: 0x6633FF,     // Dark Purple
        NOTE: 0x3399FF,        // Blue
        DEFAULT: 0x5865F2,     // Discord Blurple
        WARNING: 0xFFCC00,     // Yellow (for confirmations)
        ERROR: 0xFF0000,       // Red (for errors)
        SUCCESS: 0x00FF00,     // Green (for success)
        INFO: 0x3498DB,        // Blue (for info)
        LOCKDOWN: 0xFF6B6B,   // Light Red (for lockdown)
        RAID: 0xFF4444        // Red (for raid mode)
    },
    
    // Emoji for mod log messages
    EMOJIS: {
        WARN: '⚠️',
        MUTE: '🔇',
        UNMUTE: '🔊',
        KICK: '👢',
        BAN: '🔨',
        UNBAN: '🔓',
        SOFTBAN: '🧹',
        FILTER: '🚫',
        AUTOMOD: '🤖',
        NOTE: '📝',
        CASE: '📋',
        USER: '👤',
        MODERATOR: '🛡️',
        REASON: '📄',
        DURATION: '⏱️',
        EXPIRES: '⌛',
        ERROR: '❌',
        SUCCESS: '✅',
        LOCKDOWN: '🔒',
        UNLOCK: '🔓'
    },
    
    // ==========================================
    // PERMISSION REQUIREMENTS
    // ==========================================
    permissions: {
        warn: ['ModerateMembers'],
        mute: ['ModerateMembers'],
        kick: ['KickMembers'],
        ban: ['BanMembers'],
        delete: ['ManageMessages'],
        lockdown: ['ManageChannels'],
        automod: ['ManageGuild'],
        filter: ['ManageGuild'],
        modlogs: ['ManageGuild'],
        case: ['ModerateMembers'],
        history: ['ModerateMembers']
    },
    
    // ==========================================
    // RATE LIMITS
    // ==========================================
    rateLimits: {
        warn: { window: 60000, max: 10 },      // 10 warns per minute
        mute: { window: 60000, max: 10 },
        kick: { window: 60000, max: 5 },
        ban: { window: 60000, max: 5 },
        modAction: { window: 10000, max: 5 }   // 5 mod actions per 10 seconds
    },
    
    // ==========================================
    // CACHE SETTINGS
    // ==========================================
    cache: {
        automodSettingsTTL: 300,     // 5 minutes
        filtersTTL: 300,             // 5 minutes
        warnCountTTL: 60,            // 1 minute
        recentJoinsTTL: 60           // 1 minute for raid detection
    }
};
