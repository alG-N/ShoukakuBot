/**
 * Auto-Moderation Configuration
 * Default settings for automatic moderation features
 * @module config/features/moderation/automod
 */

module.exports = {
    // ==========================================
    // SPAM DETECTION
    // ==========================================
    spam: {
        enabled: false,
        threshold: 5,              // Messages in window to trigger
        windowMs: 5000,            // 5 second window
        action: 'delete_warn',     // delete, delete_warn, mute
        muteDurationMs: 5 * 60 * 1000,  // 5 minutes mute
        
        // Escalation: repeated spam = longer mute
        escalation: {
            enabled: true,
            multiplier: 2,         // Double duration each time
            maxDurationMs: 24 * 60 * 60 * 1000  // Max 24 hours
        }
    },
    
    // ==========================================
    // DUPLICATE MESSAGE DETECTION
    // ==========================================
    duplicate: {
        enabled: false,
        threshold: 3,              // Same message count
        windowMs: 30000,           // 30 second window
        action: 'delete_warn',
        similarity: 0.85,          // 85% similarity threshold
        ignoreCase: true,
        ignoreWhitespace: true
    },
    
    // ==========================================
    // LINK FILTER
    // ==========================================
    links: {
        enabled: false,
        action: 'delete_warn',
        
        // Whitelist mode: only allow these domains
        whitelistMode: false,
        whitelist: [],
        
        // Blacklist: block these domains (when whitelist mode off)
        blacklist: [
            'grabify.link',
            'iplogger.org',
            'iplogger.com',
            '2no.co',
            'ipgrabber.ru',
            'blasze.tk',
            'linkbucks.com'
        ],
        
        // Allow image/video links
        allowMedia: true,
        mediaExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov']
    },
    
    // ==========================================
    // DISCORD INVITE FILTER
    // ==========================================
    invites: {
        enabled: false,
        action: 'delete_warn',
        
        // Allow invites to these servers (by ID)
        whitelist: [],
        
        // Allow invites from users with these roles
        bypassRoles: [],
        
        // Invite regex patterns
        patterns: [
            /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/[\w-]+/gi,
            /discordapp\.com\/invite\/[\w-]+/gi
        ]
    },
    
    // ==========================================
    // MENTION SPAM
    // ==========================================
    mentions: {
        enabled: false,
        userLimit: 5,              // Max user mentions per message
        roleLimit: 3,              // Max role mentions per message
        totalLimit: 8,             // Max total mentions
        action: 'delete_warn',
        
        // Ignore @everyone/@here (separate setting)
        countEveryone: true
    },
    
    // ==========================================
    // CAPS LOCK SPAM
    // ==========================================
    caps: {
        enabled: false,
        percent: 70,               // % of message in caps
        minLength: 10,             // Minimum message length to check
        action: 'delete',          // Usually just delete, no warn
        
        // Ignore these
        ignoreEmoji: true,
        ignoreCommands: true
    },
    
    // ==========================================
    // EMOJI SPAM
    // ==========================================
    emoji: {
        enabled: false,
        limit: 10,                 // Max emojis per message
        action: 'delete',
        
        // Count both custom and unicode
        countCustom: true,
        countUnicode: true
    },
    
    // ==========================================
    // NEW ACCOUNT FILTER
    // ==========================================
    newAccount: {
        enabled: false,
        minAgeHours: 24,           // Account must be older than 24 hours
        action: 'kick',            // kick or restrict
        
        // For 'restrict' action: assign this role
        restrictRole: null,
        
        // DM user explaining why
        sendDM: true,
        dmMessage: 'Your account is too new to join this server. Please try again later.'
    },
    
    // ==========================================
    // RAID PROTECTION
    // ==========================================
    raid: {
        enabled: false,
        joinThreshold: 10,         // Joins in window
        windowMs: 10000,           // 10 second window
        action: 'lockdown',        // lockdown, kick_new, verification
        
        // Auto unlock after X ms (0 = manual)
        autoUnlockMs: 5 * 60 * 1000,  // 5 minutes
        
        // Additional checks during raid mode
        checkAccountAge: true,
        minAccountAgeDays: 7,
        
        // Channels to lock (empty = all text channels)
        lockChannels: [],
        
        // Verification channel for new joins during raid
        verificationChannel: null
    },
    
    // ==========================================
    // GLOBAL SETTINGS
    // ==========================================
    global: {
        // Log channel for auto-mod actions
        logChannel: null,
        
        // Roles that bypass auto-mod
        bypassRoles: [],
        
        // Channels where auto-mod is disabled
        ignoredChannels: [],
        
        // Users that bypass auto-mod (besides mods)
        bypassUsers: [],
        
        // Clean up trigger messages after X ms (0 = don't delete)
        cleanupDelayMs: 0,
        
        // Include message content in logs
        logMessageContent: true,
        
        // Maximum warns before escalating to mute
        maxAutomodWarnsBeforeMute: 3,
        automodMuteDurationMs: 10 * 60 * 1000  // 10 minutes
    }
};
