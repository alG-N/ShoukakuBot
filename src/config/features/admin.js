/**
 * Admin/Moderation Feature Configuration
 * Server administrator and moderation settings
 * @module config/features/admin
 */

module.exports = {
    // ==========================================
    // DEFAULT GUILD SETTINGS
    // ==========================================
    defaultGuildSettings: {
        snipeLimit: 10,
        deleteLimit: 100,
        announcementChannel: null,
        adminRoles: [],
        modRoles: [],
        muteRole: null,
        logChannel: null,
        autoModEnabled: false,
        welcomeChannel: null,
        welcomeMessage: null,
        goodbyeChannel: null,
        goodbyeMessage: null
    },

    // ==========================================
    // PERMISSION LEVELS
    // ==========================================
    permissionLevels: {
        SERVER_OWNER: 4,
        ADMINISTRATOR: 3,
        MODERATOR: 2,
        MEMBER: 1,
        RESTRICTED: 0
    },

    // ==========================================
    // SNIPE CONFIGURATION
    // ==========================================
    snipe: {
        minLimit: 1,
        maxLimit: 50,
        defaultLimit: 10,
        maxMessageAgeMs: 24 * 60 * 60 * 1000  // 24 hours
    },

    // ==========================================
    // DELETE CONFIGURATION
    // ==========================================
    delete: {
        minLimit: 1,
        maxLimit: 500,
        discordLimit: 100,
        defaultLimit: 100,
        maxMessageAgeDays: 14
    },

    // ==========================================
    // MUTE CONFIGURATION
    // ==========================================
    mute: {
        defaultDurationMs: 5 * 60 * 1000,       // 5 minutes
        maxDurationMs: 28 * 24 * 60 * 60 * 1000, // 28 days
        presets: {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '10m': 10 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '6h': 6 * 60 * 60 * 1000,
            '12h': 12 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '14d': 14 * 24 * 60 * 60 * 1000,
            '28d': 28 * 24 * 60 * 60 * 1000
        }
    },

    // ==========================================
    // COOLDOWNS (ms)
    // ==========================================
    cooldowns: {
        setting: 3000,
        snipe: 2000,
        kick: 1000,
        mute: 1000,
        ban: 1000,
        delete: 2000
    },

    // ==========================================
    // DEFAULT REASONS
    // ==========================================
    defaultReasons: {
        kick: 'No reason provided',
        mute: 'No reason provided',
        ban: 'No reason provided'
    },

    // ==========================================
    // LOG ACTIONS
    // ==========================================
    logActions: {
        KICK: 'KICK',
        MUTE: 'MUTE',
        UNMUTE: 'UNMUTE',
        BAN: 'BAN',
        UNBAN: 'UNBAN',
        DELETE: 'DELETE',
        WARN: 'WARN'
    }
};
