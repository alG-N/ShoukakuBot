/**
 * Moderation Feature Configuration
 * Central export for all moderation-related configs
 * @module config/features/moderation
 */

import automod, { type AutomodConfig } from './automod.js';
import punishments, { type PunishmentsConfig } from './punishments.js';
import filters, { type FiltersConfig } from './filters.js';
import type { ModerationConfig } from '../../../types/config/moderation.js';

export { type ActionType, type ModerationConfig } from '../../../types/config/moderation.js';
// CONFIG
const moderationConfig: ModerationConfig = {
    automod,
    punishments,
    filters,
    // GENERAL MODERATION SETTINGS
    // Case/Infraction types
    INFRACTION_TYPES: {
        WARN: 'warn',
        MUTE: 'mute',
        UNMUTE: 'unmute',
        KICK: 'kick',
        BAN: 'ban',
        UNBAN: 'unban',
        SOFTBAN: 'softban',
        FILTER: 'filter',
        AUTOMOD: 'automod',
        NOTE: 'note'
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
        WARN: 0xFFCC00,
        MUTE: 0xFF9900,
        UNMUTE: 0x00CC00,
        KICK: 0xFF6600,
        BAN: 0xFF0000,
        UNBAN: 0x00FF00,
        SOFTBAN: 0xFF3300,
        FILTER: 0x9933FF,
        AUTOMOD: 0x6633FF,
        NOTE: 0x3399FF,
        DEFAULT: 0x5865F2,
        WARNING: 0xFFCC00,
        ERROR: 0xFF0000,
        SUCCESS: 0x00FF00,
        INFO: 0x3498DB,
        LOCKDOWN: 0xFF6B6B,
        RAID: 0xFF4444
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
    // PERMISSION REQUIREMENTS
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
    // RATE LIMITS
    rateLimits: {
        warn: { window: 60000, max: 10 },
        mute: { window: 60000, max: 10 },
        kick: { window: 60000, max: 5 },
        ban: { window: 60000, max: 5 },
        modAction: { window: 10000, max: 5 }
    },
    // CACHE SETTINGS
    cache: {
        automodSettingsTTL: 300,
        filtersTTL: 300,
        warnCountTTL: 60,
        recentJoinsTTL: 60
    }
};

// Re-export sub-configs
export { automod, punishments, filters };
export { type AutomodConfig, type PunishmentsConfig, type FiltersConfig };

export default moderationConfig;



